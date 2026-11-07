import { createHmac } from "node:crypto";
import { expect, it } from "vitest";
import { handleApi } from "@/lib/api";
import { MemoryStore } from "@/lib/store";

it("carries two live reporters through authenticated proof, review, signed deployment, verification, and reopening", async () => {
  const store = new MemoryStore();
  const origin = "https://desk.example";
  process.env.SESSION_SECRET =
    "end-to-end-session-secret-with-thirty-two-characters";
  process.env.ADMIN_TOKEN = "owner-access-key";
  process.env.WORKER_TOKEN = "worker-access-key";
  process.env.GITHUB_WEBHOOK_SECRET = "github-hook-secret";
  process.env.GITHUB_REPOSITORY = "acme/shop";
  let delivery = 0;
  async function api(
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const request = new Request(`${origin}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { origin, "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const response = await handleApi(
      request,
      path.split("?")[0].split("/"),
      store,
    );
    return { response, body: await response.json() };
  }
  async function webhook(event: string, data: unknown) {
    const body = JSON.stringify({
      repository: { full_name: "acme/shop" },
      ...(data as object),
    });
    const signature =
      "sha256=" +
      createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!)
        .update(body)
        .digest("hex");
    const response = await handleApi(
      new Request(`${origin}/api/webhooks/github`, {
        method: "POST",
        body,
        headers: {
          "x-hub-signature-256": signature,
          "x-github-event": event,
          "x-github-delivery": `delivery-${++delivery}`,
        },
      }),
      ["webhooks", "github"],
      store,
    );
    expect(response.status).toBe(200);
  }
  const first = await api(
    "intake",
    {
      title: "Coupon total becomes negative",
      description:
        "Add an item for 200. Apply SAVE300. The total becomes negative.",
    },
    { "x-forwarded-for": "192.0.2.1" },
  );
  const second = await api(
    "intake",
    {
      title: "Coupon total becomes negative",
      description: "A 200 item and SAVE300 show a negative total.",
    },
    { "x-forwarded-for": "192.0.2.2" },
  );
  expect(first.response.status).toBe(201);
  expect(second.body.clusterId).toBe(first.body.clusterId);
  const id = first.body.clusterId;
  const login = await api("auth", { token: process.env.ADMIN_TOKEN });
  const cookie = login.response.headers.get("set-cookie")!.split(";")[0];
  const owner = { cookie };
  const worker = { authorization: `Bearer ${process.env.WORKER_TOKEN}` };
  const action = async (command: unknown) => {
    const result = await api(`bugs/${id}/actions`, command, owner);
    expect(result.response.status, JSON.stringify(result.body)).toBe(200);
  };
  await action({ type: "start_reproduction" });
  await action({
    type: "propose_reproduction",
    summary: "SAVE300 produces -100",
    steps: ["Add a 200 item", "Apply SAVE300"],
    testCommand: "npm run demo:reproduce",
    testOutput: "FAIL -100 !== 0",
    testPath: "scripts/reproduce.ts",
  });
  const wrong = await api(`track/${first.body.reportId}`, undefined, {
    "x-reporter-token": second.body.trackingToken,
  });
  expect(wrong.response.status).toBe(403);
  const confirm = await api(
    `track/${first.body.reportId}`,
    { phase: "reproduction", confirmed: true },
    { "x-reporter-token": first.body.trackingToken },
  );
  expect(confirm.body.cluster.state).toBe("confirmed");
  await action({ type: "start_fix" });
  await action({
    type: "submit_fix",
    prNumber: 42,
    prUrl: "https://github.com/acme/shop/pull/42",
    headSha: "a".repeat(40),
    changedFiles: ["shop/pricing.ts"],
    summary: "Clamp total at zero",
    testOutput: "PASS regression",
  });
  const forbidden = await api(
    `worker/bugs/${id}/actions`,
    { type: "approve_fix", note: "Agent approval" },
    worker,
  );
  expect(forbidden.response.status).toBe(403);
  await action({
    type: "approve_fix",
    note: "Inspected the regression and the patch",
  });
  await webhook("pull_request", {
    action: "closed",
    pull_request: {
      number: 42,
      merged: true,
      merge_commit_sha: "b".repeat(40),
      merged_by: { login: "owner", type: "User" },
      head: { sha: "a".repeat(40) },
      html_url: "https://github.com/acme/shop/pull/42",
    },
  });
  await webhook("deployment_status", {
    deployment: { sha: "b".repeat(40), environment: "Preview" },
    deployment_status: {
      state: "success",
      environment_url: "https://preview.example",
    },
  });
  expect((await store.read("live")).ledger.clusters[id].state).toBe("merged");
  await webhook("deployment_status", {
    deployment: { sha: "b".repeat(40), environment: "Production" },
    deployment_status: {
      state: "success",
      environment_url: "https://shop.example",
    },
  });
  const claimed = await api("worker/outbox", {}, worker);
  expect(
    claimed.body.jobs.filter((j: { kind: string }) => j.kind === "release"),
  ).toHaveLength(2);
  for (const job of claimed.body.jobs) {
    const ack = await api(
      `worker/outbox/${job.id}`,
      { leaseId: job.leaseId, success: true },
      worker,
    );
    expect(ack.response.status).toBe(200);
  }
  const verified = await api(
    `track/${first.body.reportId}`,
    { phase: "release", confirmed: true },
    { "x-reporter-token": first.body.trackingToken },
  );
  expect(verified.body.cluster.state).toBe("verified");
  const reopened = await api(
    `track/${second.body.reportId}`,
    {
      phase: "release",
      confirmed: false,
      evidence: "The same coupon still makes my cart total negative.",
    },
    { "x-reporter-token": second.body.trackingToken },
  );
  expect(reopened.body.cluster.state).toBe("reopened");
  const ledger = (await store.read("live")).ledger;
  expect(ledger.reports[first.body.reportId].releaseConfirmed).toBeUndefined();
  expect(
    ledger.outbox.some(
      (j) => j.kind === "reopen" && j.channel === "engineering",
    ),
  ).toBe(true);
});
