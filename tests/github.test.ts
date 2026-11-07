import { beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { applyGithubEvent, githubWebhook } from "@/lib/integrations/github";
import { seedDemo } from "@/lib/demo";
import { MemoryStore } from "@/lib/store";

describe("GitHub release relay", () => {
  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = "webhook-test-secret";
    process.env.GITHUB_REPOSITORY = "acme/shop";
  });
  it("rejects unsigned requests before trusting the payload", async () => {
    const request = new Request("https://desk.example/api/webhooks/github", {
      method: "POST",
      body: "{}",
    });
    await expect(githubWebhook(request, new MemoryStore())).rejects.toThrow(
      /signature/i,
    );
  });
  it("rejects a correctly signed event for the wrong repository", async () => {
    const body = JSON.stringify({ repository: { full_name: "attacker/shop" } });
    const signature =
      "sha256=" +
      createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!)
        .update(body)
        .digest("hex");
    await expect(
      githubWebhook(
        new Request("https://desk.example/api/webhooks/github", {
          method: "POST",
          headers: {
            "x-hub-signature-256": signature,
            "x-github-event": "ping",
            "x-github-delivery": "one",
          },
          body,
        }),
        new MemoryStore(),
      ),
    ).rejects.toThrow(/repository/i);
  });
  it("acknowledges duplicate deliveries without executing them twice", async () => {
    const store = new MemoryStore();
    const body = JSON.stringify({ repository: { full_name: "acme/shop" } });
    const signature =
      "sha256=" +
      createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!)
        .update(body)
        .digest("hex");
    const request = () =>
      new Request("https://desk.example/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-hub-signature-256": signature,
          "x-github-event": "ping",
          "x-github-delivery": "same-delivery",
        },
        body,
      });
    await githubWebhook(request(), store);
    const second = await githubWebhook(request(), store);
    expect(await second.json()).toEqual({ ok: true, duplicate: true });
    expect((await store.read("live")).version).toBe(1);
  });

  it("refuses a merge for a head that the ledger's humans did not review", () => {
    const ledger = seedDemo();
    const cluster = ledger.clusters["R2R-0128"];
    cluster.fix!.approvals = [
      {
        id: "owner",
        codeOwner: true,
        note: "Reviewed old head",
        at: new Date().toISOString(),
      },
    ];
    expect(() =>
      applyGithubEvent(ledger, "pull_request", {
        action: "closed",
        pull_request: {
          number: 42,
          merged: true,
          merge_commit_sha: "c".repeat(40),
          merged_by: { login: "owner", type: "User" },
          head: { sha: "b".repeat(40) },
          html_url: "https://github.com/acme/shop/pull/42",
        },
      }),
    ).toThrow(/head/i);
    expect(cluster.state).toBe("review");
  });

  it("removes a human's approval when GitHub dismisses their review", () => {
    const ledger = seedDemo();
    const cluster = ledger.clusters["R2R-0128"];
    cluster.fix!.approvals = [
      {
        id: "Owner",
        codeOwner: true,
        note: "Reviewed",
        at: new Date().toISOString(),
      },
    ];
    applyGithubEvent(ledger, "pull_request_review", {
      action: "dismissed",
      pull_request: {
        number: 42,
        merged: false,
        merge_commit_sha: "",
        head: { sha: "a".repeat(40) },
        html_url: "https://github.com/acme/shop/pull/42",
      },
      review: {
        state: "dismissed",
        commit_id: "a".repeat(40),
        user: { login: "owner", type: "User" },
      },
    });
    expect(cluster.fix!.approvals).toHaveLength(0);
  });
});
