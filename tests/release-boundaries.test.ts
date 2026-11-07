import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { handleApi } from "@/lib/api";
import { seedDemo } from "@/lib/demo";
import { execute } from "@/lib/domain/workflow";
import { applyGithubEvent, githubWebhook } from "@/lib/integrations/github";
import { MemoryStore, mutate } from "@/lib/store";

beforeEach(() => {
  process.env.SESSION_SECRET =
    "release-tests-private-session-secret-long-enough";
  process.env.GITHUB_WEBHOOK_SECRET = "release-tests-webhook";
  process.env.GITHUB_REPOSITORY = "acme/shop";
  process.env.OWNER_GITHUB_LOGINS = "same-owner,second-owner";
  process.env.CODEOWNER_GITHUB_LOGINS = "same-owner";
});

it("exposes only safe reporter evidence, without internal commands, review notes, or other report IDs", async () => {
  const store = new MemoryStore();
  const intake = await handleApi(
    new Request("https://desk.example/api/intake", {
      method: "POST",
      headers: {
        origin: "https://desk.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Receipt is blank",
        description: "Opening receipt shows a blank page.",
      }),
    }),
    ["intake"],
    store,
  );
  const { reportId, clusterId, trackingToken } = await intake.json();
  const secret = "ghp_" + "x".repeat(30);
  await mutate(store, "live", (ledger) => {
    const actor = { id: "engineer", role: "agent" as const };
    execute(ledger, clusterId, { type: "start_reproduction" }, actor);
    execute(
      ledger,
      clusterId,
      {
        type: "propose_reproduction",
        summary: "Receipt is blank",
        steps: [`Open receipt for person@example.com using ${secret}`],
        testCommand: `GITHUB_TOKEN=${secret} npm test`,
        testPath: "private/internal.test.ts",
        testOutput: "FAIL receipt",
        screenshotUrl: `https://private.example/receipt?token=${secret}`,
      },
      actor,
    );
  });
  const response = await handleApi(
    new Request(`https://desk.example/api/track/${reportId}`, {
      headers: { "x-reporter-token": trackingToken },
    }),
    ["track", reportId],
    store,
  );
  expect(response.status).toBe(200);
  const result = await response.json();
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain(secret);
  expect(serialized).not.toContain("person@example.com");
  expect(result.cluster).not.toHaveProperty("reportIds");
  expect(result.cluster).not.toHaveProperty("fix");
  expect(result.cluster.reproduction).not.toHaveProperty("testCommand");
  expect(result.cluster.reproduction).not.toHaveProperty("testPath");
  expect(result.cluster.reproduction).not.toHaveProperty("screenshotUrl");
  expect(result.cluster.reproduction.summary).toBe("Receipt is blank");
});

it("does not count a shared-key dashboard review as a second verified human", () => {
  const ledger = seedDemo();
  const c = ledger.clusters["R2R-0128"];
  c.fix!.risk = 2;
  c.fix!.approvals = [
    {
      id: "Workspace owner",
      codeOwner: true,
      note: "Dashboard review",
      at: new Date().toISOString(),
    },
  ];
  applyGithubEvent(ledger, "pull_request_review", {
    pull_request: {
      number: 42,
      merged: false,
      merge_commit_sha: "",
      head: { sha: "a".repeat(40) },
      html_url: "https://github.com/acme/shop/pull/42",
    },
    review: {
      state: "approved",
      commit_id: "a".repeat(40),
      user: { login: "same-owner", type: "User" },
    },
  });
  expect(() =>
    execute(
      ledger,
      c.id,
      {
        type: "mark_merged",
        prNumber: 42,
        mergeSha: "b".repeat(40),
        mergedBy: "same-owner",
        mergedByType: "User",
      },
      { id: "GitHub relay", role: "github" },
    ),
  ).toThrow(/two/i);
  expect(c.state).toBe("review");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each(["b", "c"])(
  "reconciles a signed production deployment (%s) that arrives before its signed merge",
  async (deployedLetter) => {
    vi.stubEnv("GITHUB_TOKEN", "test-only-github-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: "ahead" }), { status: 200 }),
      ),
    );

    const store = new MemoryStore();
    const ledger = seedDemo();
    const c = ledger.clusters["R2R-0128"];
    ledger.clusters = { [c.id]: c };
    c.fix!.approvals = [
      {
        id: "same-owner",
        codeOwner: true,
        note: "Reviewed",
        at: new Date().toISOString(),
      },
    ];
    await store.compareAndSwap("live", 0, ledger);
    function request(event: string, delivery: string, data: object) {
      const raw = JSON.stringify({
        repository: { full_name: "acme/shop" },
        ...data,
      });
      return new Request("https://desk.example/api/webhooks/github", {
        method: "POST",
        body: raw,
        headers: {
          "x-github-event": event,
          "x-github-delivery": delivery,
          "x-hub-signature-256":
            "sha256=" +
            createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!)
              .update(raw)
              .digest("hex"),
        },
      });
    }
    const deployment = () =>
      request("deployment_status", "early-deploy", {
        deployment: {
          sha: deployedLetter.repeat(40),
          environment: "Production",
        },
        deployment_status: {
          state: "success",
          environment_url: "https://shop.example",
        },
      });
    expect((await githubWebhook(deployment(), store)).status).toBe(200);
    expect((await store.read("live")).ledger.clusters[c.id].state).toBe(
      "review",
    );
    await githubWebhook(
      request("pull_request", "later-merge", {
        action: "closed",
        pull_request: {
          number: 42,
          merged: true,
          merge_commit_sha: "b".repeat(40),
          merged_by: { login: "same-owner", type: "User" },
          head: { sha: "a".repeat(40) },
          html_url: "https://github.com/acme/shop/pull/42",
        },
      }),
      store,
    );
    const latest = (await store.read("live")).ledger;
    expect(latest.clusters[c.id].state).toBe("deployed");
    const jobs = latest.outbox.filter(
      (j) => j.clusterId === c.id && j.kind === "release",
    );
    expect(jobs).toHaveLength(c.reportIds.length);
    expect(await (await githubWebhook(deployment(), store)).json()).toEqual({
      ok: true,
      duplicate: true,
    });
    expect(
      (await store.read("live")).ledger.outbox.filter(
        (j) => j.clusterId === c.id && j.kind === "release",
      ),
    ).toHaveLength(jobs.length);
  },
);
