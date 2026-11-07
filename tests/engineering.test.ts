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
