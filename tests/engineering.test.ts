import { beforeEach, expect, it } from "vitest";
import { handleApi } from "@/lib/api";
import { MemoryStore, mutate } from "@/lib/store";
import { intake } from "@/lib/domain/workflow";

let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  process.env.ENGINEERING_TOKEN = "engineering-test-token";
  process.env.WORKER_TOKEN = "concierge-test-token";
});
async function call(
  path: string,
  body?: unknown,
  token = "engineering-test-token",
) {
  return handleApi(
    new Request(`https://desk.example/api/engineering/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    ["engineering", ...path.split("/")],
    store,
  );
}
async function seed() {
  return mutate(store, "live", (ledger) =>
    intake(ledger, {
      title: "ShopLite overflows with a very large price",
      description:
        "A finite price of 1e308 returns Infinity instead of rejecting it.",
      source: "web",
      reporterId: "private-reporter",
      tokenHash: "private-capability",
      route: { roomId: "private-room", platformUserId: "private-user" },
    }),
  );
}
it("gives engineering sanitized work without reporter capabilities or identities", async () => {
  await seed();
  const response = await call("work");
  expect(response.status).toBe(200);
  const work = await response.json();
  expect(work.clusters[0].dossier.actual).toContain("Infinity");
  expect(JSON.stringify(work)).not.toMatch(
    /private-|reportIds|tokenHash|rawHash|platformUserId/,
  );
});
it("separates engineering and concierge authority", async () => {
  expect((await call("work", undefined, "concierge-test-token")).status).toBe(
    401,
  );
  const response = await handleApi(
    new Request("https://desk.example/api/worker/answers", {
      method: "POST",
      headers: { authorization: "Bearer engineering-test-token" },
      body: "{}",
    }),
    ["worker", "answers"],
    store,
  );
  expect(response.status).toBe(401);
});

it("records engineering liveness with a server timestamp and separate service authority", async () => {
  const heartbeat = {
    roomsConnected: 4,
    provider: "meta",
    model: "muse-spark-1.3",
    version: "1.1.0",
  };
  expect(
    (await call("heartbeat", heartbeat, "concierge-test-token")).status,
  ).toBe(401);
  expect((await store.read("live")).version).toBe(0);
  const before = Date.now();
  expect((await call("heartbeat", heartbeat)).status).toBe(200);
  const recorded = (await store.read("live")).ledger.engineeringHeartbeat;
  expect(recorded).toMatchObject(heartbeat);
  expect(Date.parse(recorded!.at)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(recorded!.at)).toBeLessThanOrEqual(Date.now());
});

it("rejects invalid or extra heartbeat data without changing the ledger", async () => {
  const heartbeat = {
    roomsConnected: 4,
    provider: "meta",
    model: "muse-spark-1.3",
    version: "1.1.0",
  };
  for (const invalid of [
    { roomsConnected: 5 },
    { roomsConnected: -1 },
    { roomsConnected: 2.5 },
    { provider: "unknown" },
    { model: "" },
    { model: "https://provider.example/?key=private" },
    { version: "x".repeat(41) },
    { at: "2099-01-01T00:00:00.000Z" },
    { token: "private-provider-key" },
  ]) {
    expect((await call("heartbeat", { ...heartbeat, ...invalid })).status).toBe(
      400,
    );
  }
  expect((await store.read("live")).version).toBe(0);
});

it("pages actionable work so earlier reviewed or blocked bugs cannot starve new reports", async () => {
  const report = await seed();
  await mutate(store, "live", (ledger) => {
    const template = ledger.clusters[report.clusterId];
    ledger.clusters = Object.fromEntries(
      Array.from({ length: 201 }, (_, i) => {
        const id = `R2R-${String(i + 1).padStart(4, "0")}`;
        return [
          id,
          { ...template, id, state: i < 100 ? "review" : "reproducing" },
        ];
      }),
    );
  });
  const first = await (await call("work")).json();
  expect(first.clusters[0].id).toBe("R2R-0101");
  expect(first.nextCursor).toBe("R2R-0200");
  const next = await handleApi(
    new Request("https://desk.example/api/engineering/work?after=R2R-0200", {
      headers: { authorization: "Bearer engineering-test-token" },
    }),
    ["engineering", "work"],
    store,
  );
  expect((await next.json()).clusters.map((c: { id: string }) => c.id)).toEqual(
    ["R2R-0201"],
  );
});
it("keeps reporter confirmation and human release authority outside the runtime", async () => {
  const report = await seed();
  const path = `bugs/${report.clusterId}/actions`;
  expect((await call(path, { type: "start_reproduction" })).status).toBe(200);
  expect((await call(path, { type: "start_fix" })).status).toBe(409);
  for (const type of [
    "approve_fix",
    "confirm_reproduction",
    "verify_release",
    "mark_merged",
    "deploy",
    "release_quarantine",
  ]) {
    expect((await call(path, { type })).status).toBe(403);
  }
});
