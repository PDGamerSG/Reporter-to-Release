import { audit, DomainError, execute, type Ledger } from "../domain/workflow";
import { verifyGithubSignature } from "../security";
import { boundedBody, json } from "../http";
import { getStore, mutate, type Store } from "../store";

type GithubPayload = {
  repository?: { full_name?: string };
  action?: string;
  pull_request?: {
    number: number;
    merged: boolean;
    merge_commit_sha: string;
    merged_by?: { login: string; type: string };
    head: { sha: string };
    html_url: string;
  };
  review?: {
    state: string;
    commit_id: string;
    user: { login: string; type: string };
    body?: string;
  };
  deployment?: { sha: string; environment: string; ref?: string };
  deployment_status?: {
    state: string;
    environment_url?: string;
    target_url?: string;
  };
};
export async function containsCommit(
  repository: string,
  base: string,
  head: string,
): Promise<boolean> {
  if (base === head) return true;
  // A commit GitHub no longer has cannot prove ancestry, so release evidence
  // fails closed instead of rejecting the whole webhook delivery.
  const response = await githubRequest(
    `/repos/${repository}/compare/${base}...${head}`,
    {},
    [404],
  );
  if (response.status === 404) return false;
  const data = await response.json();
  return data.status === "ahead" || data.status === "identical";
}
export async function githubRequest(
  path: string,
  init: RequestInit = {},
  allowedStatuses: number[] = [],
) {
  if (!process.env.GITHUB_TOKEN)
    throw new DomainError("GitHub API credentials are not configured.", 503);
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!response.ok && !allowedStatuses.includes(response.status))
    throw new DomainError(`GitHub returned HTTP ${response.status}.`, 502);
  return response;
}

export function applyGithubEvent(
  ledger: Ledger,
  event: string,
  payload: GithubPayload,
  ancestry: Record<string, string[]> = {},
) {
  const actor = { id: "GitHub relay", role: "github" as const };
  const pr = payload.pull_request;
  if (event === "pull_request" && pr) {
    for (const cluster of Object.values(ledger.clusters).filter(
      (c) => c.fix?.prNumber === pr.number,
    )) {
      if (payload.action === "synchronize" && cluster.state === "review") {
        cluster.fix!.headSha = pr.head.sha;
        cluster.fix!.approvals = [];
        continue;
      }
      if (
        payload.action === "closed" &&
        pr.merged &&
        cluster.state === "review"
      ) {
        if (cluster.fix!.headSha !== pr.head.sha)
          throw new DomainError(
            "The merged PR head differs from the reviewed head. Reconcile the synchronize and review events before redelivering the merge.",
          );
        execute(
          ledger,
          cluster.id,
          {
            type: "mark_merged",
            prNumber: pr.number,
            mergeSha: pr.merge_commit_sha,
            mergedBy: pr.merged_by?.login ?? "unknown",
            mergedByType: pr.merged_by?.type ?? "unknown",
          },
          actor,
        );
      }
    }
  }
  if (
    event === "pull_request_review" &&
    pr &&
    payload.review?.state === "dismissed"
  ) {
    const reviewer = payload.review.user.login.toLowerCase();
    for (const cluster of Object.values(ledger.clusters).filter(
      (c) => c.state === "review" && c.fix?.prNumber === pr.number,
    )) {
      const before = cluster.fix!.approvals.length;
      cluster.fix!.approvals = cluster.fix!.approvals.filter(
        (a) => a.id.toLowerCase() !== reviewer,
      );
      if (before !== cluster.fix!.approvals.length)
        audit(
          ledger,
          cluster,
          "review_dismissed",
          "GitHub review dismissed",
          "The dismissed approval no longer counts toward the merge gate.",
          payload.review.user.login,
        );
    }
  }
  if (
    event === "pull_request_review" &&
    pr &&
    payload.review?.state === "approved"
  ) {
    const review = payload.review;
    const allowed = (process.env.OWNER_GITHUB_LOGINS ?? "")
      .toLowerCase()
      .split(",")
      .map((v) => v.trim());
    if (
      review.user.type !== "User" ||
      !allowed.includes(review.user.login.toLowerCase())
    )
      return;
    for (const cluster of Object.values(ledger.clusters).filter(
      (c) =>
        c.state === "review" &&
        c.fix?.prNumber === pr.number &&
        c.fix.headSha === review.commit_id,
    )) {
      execute(
        ledger,
        cluster.id,
        { type: "approve_fix", note: review.body || "Approved on GitHub." },
        {
          id: review.user.login,
          role: "owner",
          verifiedHumanId: review.user.login.toLowerCase(),
          codeOwner: (process.env.CODEOWNER_GITHUB_LOGINS ?? "")
            .toLowerCase()
            .split(",")
            .includes(review.user.login.toLowerCase()),
        },
      );
    }
  }
  if (
    event === "deployment_status" &&
    payload.deployment_status?.state === "success" &&
    payload.deployment?.environment.toLowerCase() === "production"
  ) {
    const deployment = payload.deployment!;
    const url =
      payload.deployment_status.environment_url ||
      payload.deployment_status.target_url ||
      "";
    if (!/^[a-f\d]{40}$/i.test(deployment.sha) || !url.startsWith("https://"))
      throw new DomainError(
        "A production deployment requires a full SHA and HTTPS URL.",
        400,
      );
    ledger.productionDeployments ??= [];
    if (
      !ledger.productionDeployments.some(
        (d) => d.sha === deployment.sha && d.url === url,
      )
    )
      ledger.productionDeployments.push({
        sha: deployment.sha,
        url,
        version: deployment.sha.slice(0, 7),
        recordedAt: new Date().toISOString(),
      });
  }
  for (const deployment of [
    ...(ledger.productionDeployments ?? []),
  ].reverse()) {
    for (const cluster of Object.values(ledger.clusters).filter(
      (c) =>
        c.state === "merged" &&
        c.fix?.mergeSha &&
        (c.fix.mergeSha === deployment.sha ||
          ancestry[deployment.sha]?.includes(c.fix.mergeSha)),
    )) {
      execute(
        ledger,
        cluster.id,
        {
          type: "deploy",
          sha: deployment.sha,
          environment: "production",
          url: deployment.url,
          version: deployment.version,
          ancestryVerified: ancestry[deployment.sha]?.includes(
            cluster.fix!.mergeSha!,
          ),
        },
        actor,
      );
    }
  }
}

export async function githubWebhook(
  request: Request,
  store: Store = getStore(),
) {
  const raw = await boundedBody(request, 1048576);
  if (
    !verifyGithubSignature(
      raw,
      request.headers.get("x-hub-signature-256") ?? "",
      process.env.GITHUB_WEBHOOK_SECRET ?? "",
    )
  )
    throw new DomainError("Invalid GitHub webhook signature.", 401);
  const delivery = request.headers.get("x-github-delivery");
  const event = request.headers.get("x-github-event");
  if (!delivery || !event)
    throw new DomainError(
      "GitHub event and delivery headers are required.",
      400,
    );
  let payload: GithubPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new DomainError("Invalid webhook JSON.", 400);
  }
  if (
    payload.repository?.full_name?.toLowerCase() !==
    process.env.GITHUB_REPOSITORY?.toLowerCase()
  )
    throw new DomainError(
      "This repository is not connected to this desk.",
      403,
    );
  const current = (await store.read("live")).ledger;
  if (current.deliveries[`github:${delivery}`])
    return json({ ok: true, duplicate: true });
  const comparisons = new Map<string, Promise<boolean>>();
  function containsCached(base: string, head: string) {
    const key = `${base}:${head}`;
    if (!comparisons.has(key))
      comparisons.set(
        key,
        containsCommit(process.env.GITHUB_REPOSITORY!, base, head),
      );
    return comparisons.get(key)!;
  }
  await mutate(store, "live", async (ledger) => {
    if (ledger.deliveries[`github:${delivery}`]) return;
    const ancestry: Record<string, string[]> = {};
    if (
      (event === "pull_request" &&
        payload.action === "closed" &&
        payload.pull_request?.merged) ||
      (event === "deployment_status" &&
        payload.deployment_status?.state === "success" &&
        payload.deployment?.environment.toLowerCase() === "production")
    ) {
      const mergedShas = new Set(
        Object.values(ledger.clusters)
          .filter((c) => c.state === "merged")
          .map((c) => c.fix?.mergeSha)
          .filter((s): s is string => Boolean(s)),
      );
      if (event === "pull_request" && payload.pull_request?.merge_commit_sha)
        mergedShas.add(payload.pull_request.merge_commit_sha);
      const deployedShas = new Set(
        (ledger.productionDeployments ?? []).map((d) => d.sha),
      );
      if (event === "deployment_status" && payload.deployment?.sha)
        deployedShas.add(payload.deployment.sha);
      for (const deployedSha of deployedShas) {
        ancestry[deployedSha] = [];
        for (const sha of mergedShas) {
          if (await containsCached(sha, deployedSha))
            ancestry[deployedSha].push(sha);
        }
      }
    }
    applyGithubEvent(ledger, event, payload, ancestry);
    ledger.deliveries[`github:${delivery}`] = new Date().toISOString();
    ledger.githubLastEventAt = new Date().toISOString();
  });
  return json({ ok: true });
}
