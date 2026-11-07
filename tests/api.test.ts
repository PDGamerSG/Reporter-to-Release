import { beforeEach, describe, expect, it } from "vitest";
import { handleApi } from "@/lib/api";
import { MemoryStore } from "@/lib/store";

const origin = "http://localhost:3000";
function request(path: string, method = "GET", body?: unknown, cookie?: string, extra: Record<string, string> = {}) {
  return new Request(`${origin}/api/${path}`, { method, headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
}
describe("application HTTP boundaries", () => {
  let store: MemoryStore;
  beforeEach(() => { store = new MemoryStore(); process.env.SESSION_SECRET = "test-secret-at-least-thirty-two-characters"; process.env.ADMIN_TOKEN = "test-admin-token"; process.env.WORKER_TOKEN = "test-worker-token"; });

  it("creates isolated demonstration workspaces without exposing private routing or tokens", async () => {
    const response = await handleApi(request("workspace"), ["workspace"], store);
    const workspace = await response.json();
    expect(workspace.mode).toBe("demo");
    expect(workspace.clusters.length).toBeGreaterThan(3);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(JSON.stringify(workspace)).not.toMatch(/tokenHash|rawHash|platformUserId|demo-person/);
    expect(Object.keys((await store.read("live")).ledger.clusters)).toHaveLength(0);
  });

  it("requires the live owner session and blocks cross-origin mutations", async () => {
    const bad = await handleApi(new Request(`${origin}/api/reports`, { method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: JSON.stringify({ title: "Cart crashes", description: "Opening cart crashes." }) }), ["reports"], store);
    expect(bad.status).toBe(403);
    const login = await handleApi(request("auth", "POST", { token: "test-admin-token" }), ["auth"], store);
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const live = await handleApi(request("workspace", "GET", undefined, cookie), ["workspace"], store);
    expect((await live.json()).mode).toBe("live");
  });

  it("never accepts reporter IDs or deployment commands from the browser", async () => {
    const response = await handleApi(request("reports", "POST", { title: "Cart crash", description: "Cart crashes.", reporterId: "owner" }), ["reports"], store);
    expect(response.status).toBe(400);
    const forbidden = await handleApi(request("bugs/R2R-0128/actions", "POST", { type: "deploy", sha: "a".repeat(40) }), ["bugs", "R2R-0128", "actions"], store);
    expect(forbidden.status).toBe(403);
  });

  it("requires the original reporter's private tracking capability", async () => {
    const created = await handleApi(request("intake", "POST", { title: "Cart crashes", description: "The cart crashes when opening." }), ["intake"], store);
    expect(created.status).toBe(201);
    const { reportId, trackingToken } = await created.json();
    const denied = await handleApi(request(`track/${reportId}`), ["track", reportId], store);
    expect(denied.status).toBe(403);
    const allowed = await handleApi(request(`track/${reportId}`, "GET", undefined, undefined, { "x-reporter-token": trackingToken }), ["track", reportId], store);
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).cluster.title).toBe("Cart crashes");
  });

  it("refuses unauthenticated worker requests", async () => {
    const response = await handleApi(request("worker/outbox", "POST", {}), ["worker", "outbox"], store);
    expect(response.status).toBe(401);
  });
});
