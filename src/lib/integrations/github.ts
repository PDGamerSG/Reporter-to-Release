import { DomainError, execute, type Ledger } from "../domain/workflow";
import { verifyGithubSignature } from "../security";
import { boundedBody, json } from "../http";
import { getStore, mutate, type Store } from "../store";

type GithubPayload = {
  repository?: { full_name?: string }; action?: string;
  pull_request?: { number: number; merged: boolean; merge_commit_sha: string; merged_by?: { login: string; type: string }; head: { sha: string }; html_url: string };
  review?: { state: string; commit_id: string; user: { login: string; type: string }; body?: string };
  deployment?: { sha: string; environment: string; ref?: string };
  deployment_status?: { state: string; environment_url?: string; target_url?: string };
};
export async function containsCommit(repository: string, base: string, head: string): Promise<boolean> {
  if (base === head) return true;
  const response = await githubRequest(`/repos/${repository}/compare/${base}...${head}`);
  const data = await response.json(); return data.status === "ahead" || data.status === "identical";
}
export async function githubRequest(path: string, init: RequestInit = {}) {
  if (!process.env.GITHUB_TOKEN) throw new DomainError("GitHub API credentials are not configured.", 503);
  const response = await fetch(`https://api.github.com${path}`, { ...init, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...init.headers }, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!response.ok) throw new DomainError(`GitHub returned HTTP ${response.status}.`, 502);
  return response;
}

export function applyGithubEvent(ledger: Ledger, event: string, payload: GithubPayload, ancestors: string[] = []) {
  const actor = { id: "GitHub relay", role: "github" as const };
  const pr = payload.pull_request;
  if (event === "pull_request" && pr) {
    for (const cluster of Object.values(ledger.clusters).filter(c => c.fix?.prNumber === pr.number)) {
      if (payload.action === "synchronize" && cluster.state === "review") {
        cluster.fix!.headSha = pr.head.sha; cluster.fix!.approvals = [];
        continue;
      }
      if (payload.action === "closed" && pr.merged && cluster.state === "review") execute(ledger, cluster.id, { type: "mark_merged", prNumber: pr.number, mergeSha: pr.merge_commit_sha, mergedBy: pr.merged_by?.login ?? "unknown", mergedByType: pr.merged_by?.type ?? "unknown" }, actor);
    }
  }
  if (event === "pull_request_review" && pr && payload.review?.state === "approved") {
    const review = payload.review;
    const allowed = (process.env.OWNER_GITHUB_LOGINS ?? "").toLowerCase().split(",").map(v => v.trim());
    if (review.user.type !== "User" || !allowed.includes(review.user.login.toLowerCase())) return;
    for (const cluster of Object.values(ledger.clusters).filter(c => c.state === "review" && c.fix?.prNumber === pr.number && c.fix.headSha === review.commit_id)) {
      execute(ledger, cluster.id, { type: "approve_fix", note: review.body || "Approved on GitHub." }, { id: review.user.login, role: "owner", codeOwner: (process.env.CODEOWNER_GITHUB_LOGINS ?? "").toLowerCase().split(",").includes(review.user.login.toLowerCase()) });
    }
  }
  if (event === "deployment_status" && payload.deployment_status?.state === "success" && payload.deployment?.environment.toLowerCase() === "production") {
    for (const cluster of Object.values(ledger.clusters).filter(c => c.state === "merged" && c.fix?.mergeSha && (c.fix.mergeSha === payload.deployment!.sha || ancestors.includes(c.fix.mergeSha)))) {
      execute(ledger, cluster.id, { type: "deploy", sha: payload.deployment!.sha, environment: "production", url: payload.deployment_status.environment_url || payload.deployment_status.target_url || "", version: payload.deployment!.sha.slice(0, 7), ancestryVerified: ancestors.includes(cluster.fix!.mergeSha!) }, actor);
    }
  }
}

export async function githubWebhook(request: Request, store: Store = getStore()) {
  const raw = await boundedBody(request, 1048576);
  if (!verifyGithubSignature(raw, request.headers.get("x-hub-signature-256") ?? "", process.env.GITHUB_WEBHOOK_SECRET ?? "")) throw new DomainError("Invalid GitHub webhook signature.", 401);
  const delivery = request.headers.get("x-github-delivery"); const event = request.headers.get("x-github-event");
  if (!delivery || !event) throw new DomainError("GitHub event and delivery headers are required.", 400);
  let payload: GithubPayload;
  try { payload = JSON.parse(raw); } catch { throw new DomainError("Invalid webhook JSON.", 400); }
  if (payload.repository?.full_name?.toLowerCase() !== process.env.GITHUB_REPOSITORY?.toLowerCase()) throw new DomainError("This repository is not connected to this desk.", 403);
  const current = (await store.read("live")).ledger;
  if (current.deliveries[`github:${delivery}`]) return json({ ok: true, duplicate: true });
  const ancestors: string[] = [];
  if (event === "deployment_status" && payload.deployment_status?.state === "success" && payload.deployment?.environment.toLowerCase() === "production") {
    for (const sha of new Set(Object.values(current.clusters).filter(c => c.state === "merged").map(c => c.fix?.mergeSha).filter((s): s is string => Boolean(s)))) {
      if (await containsCommit(process.env.GITHUB_REPOSITORY!, sha, payload.deployment.sha)) ancestors.push(sha);
    }
  }
  await mutate(store, "live", ledger => {
    if (ledger.deliveries[`github:${delivery}`]) return;
    applyGithubEvent(ledger, event, payload, ancestors);
    ledger.deliveries[`github:${delivery}`] = new Date().toISOString();
    ledger.githubLastEventAt = new Date().toISOString();
  });
  return json({ ok: true });
}
