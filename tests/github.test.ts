import { beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { githubWebhook } from "@/lib/integrations/github";
import { MemoryStore } from "@/lib/store";

describe("GitHub release relay", () => {
  beforeEach(() => { process.env.GITHUB_WEBHOOK_SECRET = "webhook-test-secret"; process.env.GITHUB_REPOSITORY = "acme/shop"; });
  it("rejects unsigned requests before trusting the payload", async () => {
    const request = new Request("https://desk.example/api/webhooks/github", { method: "POST", body: "{}" });
    await expect(githubWebhook(request, new MemoryStore())).rejects.toThrow(/signature/i);
  });
  it("rejects a correctly signed event for the wrong repository", async () => {
    const body = JSON.stringify({ repository: { full_name: "attacker/shop" } });
    const signature = "sha256=" + createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!).update(body).digest("hex");
    await expect(githubWebhook(new Request("https://desk.example/api/webhooks/github", { method: "POST", headers: { "x-hub-signature-256": signature, "x-github-event": "ping", "x-github-delivery": "one" }, body }), new MemoryStore())).rejects.toThrow(/repository/i);
  });
  it("acknowledges duplicate deliveries without executing them twice", async () => {
    const store = new MemoryStore();
    const body = JSON.stringify({ repository: { full_name: "acme/shop" } });
    const signature = "sha256=" + createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!).update(body).digest("hex");
    const request = () => new Request("https://desk.example/api/webhooks/github", { method: "POST", headers: { "x-hub-signature-256": signature, "x-github-event": "ping", "x-github-delivery": "same-delivery" }, body });
    await githubWebhook(request(), store);
    const second = await githubWebhook(request(), store);
    expect(await second.json()).toEqual({ ok: true, duplicate: true });
    expect((await store.read("live")).version).toBe(1);
  });
});
