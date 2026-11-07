import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PROJECT_ID = "prj_p7VIwQcUZo3uHYZeizYiFB4tqKgZ";
const TEAM_ID = "team_9DmQgMjE796WaejfWWU17kYK";
const PRODUCTION_HOST = "reporter-to-release.pallabdas.me";
const PRODUCTION_URL = `https://${PRODUCTION_HOST}`;
const TASK = "verify:vercel-production";
const RECORDER = "reporter-to-release/vercel-production-v1";
const FULL_SHA = /^[a-f0-9]{40}$/;

type ApiObject = Record<string, unknown>;
type Config = {
  sha: string;
  repository: string;
  vercelToken: string;
  githubToken: string;
};
type Dependencies = {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  maxWaitMs?: number;
  pollIntervalMs?: number;
};
type VerifiedDeployment = { id: string; host: string };

// Only fixed messages reach logs; remote bodies and dependency errors may contain secrets.
class RecorderError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

function object(value: unknown): ApiObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ApiObject)
    : {};
}

function validRepository(repository: string) {
  return (
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) &&
    repository.split("/").every((part) => part !== "." && part !== "..")
  );
}

export function trustedRevision(event: unknown, repository: string): string {
  const payload = object(event);
  const run = object(payload.workflow_run);
  if (
    !validRepository(repository) ||
    payload.action !== "completed" ||
    run.name !== "Verify application" ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    run.event !== "push" ||
    run.head_branch !== "main" ||
    object(run.head_repository).full_name !== repository ||
    typeof run.head_sha !== "string" ||
    !FULL_SHA.test(run.head_sha)
  )
    throw new RecorderError(
      "A trusted successful Verify application run for a main push is required.",
    );
  return run.head_sha;
}

function matchingRevision(data: ApiObject, sha: string, required: boolean) {
  const revisions = [
    object(data.gitSource).sha,
    object(data.meta).githubCommitSha,
  ].filter((value) => value !== undefined);
  return (
    (!required || revisions.length > 0) &&
    revisions.every((value) => value === sha)
  );
}

function immutableHost(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(value)
  );
}

export async function recordProductionRelease(
  config: Config,
  dependencies: Dependencies = {},
) {
  if (!FULL_SHA.test(config.sha))
    throw new RecorderError(
      "The production revision must be a full commit SHA.",
    );
  if (!validRepository(config.repository))
    throw new RecorderError("A valid GitHub repository is required.");
  if (!config.vercelToken || !config.githubToken)
    throw new RecorderError("Vercel and GitHub API credentials are required.");

  const fetcher = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const maxWaitMs = dependencies.maxWaitMs ?? 10 * 60 * 1000;
  const pollIntervalMs = dependencies.pollIntervalMs ?? 10_000;
  if (
    !Number.isSafeInteger(maxWaitMs) ||
    maxWaitMs < 1 ||
    maxWaitMs > 15 * 60 * 1000 ||
    !Number.isSafeInteger(pollIntervalMs) ||
    pollIntervalMs < 1 ||
    pollIntervalMs > 30_000
  )
    throw new RecorderError("Production polling limits are invalid.");
  const deadline = now() + maxWaitMs;

  async function requestJson(
    url: URL,
    source: "Vercel" | "GitHub" | "Health",
    init: RequestInit = {},
  ): Promise<unknown> {
    const remaining = deadline - now();
    if (remaining <= 0)
      throw new RecorderError("Production verification timed out.");
    let response: Response;
    try {
      response = await fetcher(url, {
        ...init,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(15_000, remaining)),
      });
    } catch {
      throw new RecorderError(`${source} request failed.`, source !== "GitHub");
    }
    if (!response.ok || (source === "Health" && response.status !== 200))
      throw new RecorderError(
        `${source} returned HTTP ${response.status}.`,
        source !== "GitHub" && ![401, 403].includes(response.status),
      );
    try {
      return await response.json();
    } catch {
      throw new RecorderError(
        `${source} returned invalid JSON.`,
        source !== "GitHub",
      );
    }
  }

  function vercel(path: string, query: Record<string, string> = {}) {
    const url = new URL(path, "https://api.vercel.com");
    url.search = new URLSearchParams({ teamId: TEAM_ID, ...query }).toString();
    return requestJson(url, "Vercel", {
      headers: { Authorization: `Bearer ${config.vercelToken}` },
    });
  }

  function github(path: string, body?: ApiObject) {
    return requestJson(new URL(path, "https://api.github.com"), "GitHub", {
      method: body ? "POST" : "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.githubToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  async function verifyAlias(deployment: VerifiedDeployment) {
    const binding = object(
      await vercel(`/v4/aliases/${PRODUCTION_HOST}`, { projectId: PROJECT_ID }),
    );
    const nested = object(binding.deployment);
    if (
      binding.alias !== PRODUCTION_HOST ||
      binding.projectId !== PROJECT_ID ||
      binding.deploymentId !== deployment.id ||
      (nested.id !== undefined && nested.id !== deployment.id) ||
      (nested.url !== undefined && nested.url !== deployment.host) ||
      (binding.redirect !== undefined && binding.redirect !== null) ||
      (binding.redirectStatusCode !== undefined &&
        binding.redirectStatusCode !== null)
    )
      throw new RecorderError(
        "The production alias is not bound to the exact Vercel deployment.",
        true,
      );
  }

  async function verifyHealth(host: string) {
    // Health requests have no authorization, cookies, or deployment-protection bypass.
    const health = object(
      await requestJson(new URL(`https://${host}/api/health`), "Health", {
        headers: { "Cache-Control": "no-cache" },
      }),
    );
    if (
      health.service !== "Reporter-to-Release" ||
      health.status !== "ok" ||
      health.storage !== "postgres"
    )
      throw new RecorderError(
        "Production health did not confirm Reporter-to-Release with Postgres.",
        true,
      );
  }

  async function verifyDeployment(candidate: VerifiedDeployment) {
    const details = object(
      await vercel(`/v13/deployments/${candidate.id}`, {
        withGitRepoInfo: "true",
      }),
    );
    if (
      details.id !== candidate.id ||
      object(details.project).id !== PROJECT_ID ||
      object(details.team).id !== TEAM_ID ||
      details.target !== "production" ||
      details.readyState !== "READY" ||
      !matchingRevision(details, config.sha, true) ||
      !immutableHost(details.url) ||
      details.url !== candidate.host
    )
      throw new RecorderError(
        "Vercel deployment identity, revision, target, or READY state did not match.",
        true,
      );
    await verifyAlias(candidate);
    await verifyHealth(candidate.host);
    await verifyHealth(PRODUCTION_HOST);
    await verifyAlias(candidate);
    return candidate;
  }

  let verified: VerifiedDeployment | undefined;
  let pending = "No exact READY production deployment was found.";
  const maxAttempts = Math.ceil(maxWaitMs / pollIntervalMs) + 1;
  for (let attempt = 0; attempt < maxAttempts && now() < deadline; attempt++) {
    try {
      const result = object(
        await vercel("/v7/deployments", {
          projectId: PROJECT_ID,
          target: "production",
          sha: config.sha,
          limit: "100",
        }),
      );
      if (!Array.isArray(result.deployments))
        throw new RecorderError(
          "Vercel returned an invalid deployment list.",
          true,
        );
      for (const value of result.deployments.slice(0, 100)) {
        const candidate = object(value);
        if (
          candidate.projectId !== PROJECT_ID ||
          candidate.target !== "production" ||
          candidate.readyState !== "READY" ||
          (candidate.state !== undefined && candidate.state !== "READY") ||
          !matchingRevision(candidate, config.sha, false) ||
          typeof candidate.uid !== "string" ||
          !/^dpl_[A-Za-z0-9]+$/.test(candidate.uid) ||
          !immutableHost(candidate.url)
        )
          continue;
        verified = await verifyDeployment({
          id: candidate.uid,
          host: candidate.url,
        });
        break;
      }
      if (verified) break;
    } catch (error) {
      if (!(error instanceof RecorderError) || !error.retryable) throw error;
      pending = error.message;
    }
    const remaining = deadline - now();
    if (remaining > 0) await sleep(Math.min(pollIntervalMs, remaining));
  }
  if (!verified)
    throw new RecorderError(`Production verification timed out. ${pending}`);

  const immutableUrl = `https://${verified.host}`;
  const payload = {
    recorder: RECORDER,
    vercelDeploymentId: verified.id,
    vercelProjectId: PROJECT_ID,
    vercelTeamId: TEAM_ID,
    immutableUrl,
    productionHost: PRODUCTION_HOST,
  };
  function matchingRecord(value: unknown) {
    const deployment = object(value);
    const recordedPayload = object(deployment.payload);
    return (
      deployment.sha === config.sha &&
      deployment.environment === "production" &&
      deployment.task === TASK &&
      Object.entries(payload).every(
        ([key, value]) => recordedPayload[key] === value,
      )
    );
  }

  const repositoryPath = `/repos/${config.repository}`;
  let githubDeployment: ApiObject | undefined;
  // Exact SHA, task and environment constrain this bounded idempotency lookup.
  for (let page = 1; page <= 10; page++) {
    const query = new URLSearchParams({
      sha: config.sha,
      environment: "production",
      task: TASK,
      per_page: "100",
      page: String(page),
    });
    const deployments = await github(`${repositoryPath}/deployments?${query}`);
    if (!Array.isArray(deployments))
      throw new RecorderError("GitHub returned an invalid deployment list.");
    githubDeployment = deployments.find(matchingRecord) as
      ApiObject | undefined;
    if (githubDeployment || deployments.length < 100) break;
    if (page === 10)
      throw new RecorderError(
        "GitHub deployment lookup exceeded its page limit.",
      );
  }
  if (!githubDeployment) {
    githubDeployment = object(
      await github(`${repositoryPath}/deployments`, {
        ref: config.sha,
        task: TASK,
        auto_merge: false,
        required_contexts: [],
        environment: "production",
        transient_environment: false,
        production_environment: true,
        description:
          "Record independently verified Vercel production evidence.",
        payload,
      }),
    );
  }
  const githubDeploymentId = githubDeployment.id;
  if (
    !matchingRecord(githubDeployment) ||
    typeof githubDeploymentId !== "number" ||
    !Number.isSafeInteger(githubDeploymentId) ||
    githubDeploymentId <= 0
  )
    throw new RecorderError("GitHub returned a mismatched deployment record.");

  const statusesPath = `${repositoryPath}/deployments/${githubDeploymentId}/statuses`;
  const statuses = await github(`${statusesPath}?per_page=100`);
  if (!Array.isArray(statuses))
    throw new RecorderError(
      "GitHub returned an invalid deployment status list.",
    );
  const latest = object(statuses[0]);
  let recorded = false;
  if (latest.state !== "success" || latest.environment_url !== PRODUCTION_URL) {
    // GitHub reads/creation may take time: repeat evidence checks immediately before success.
    await verifyDeployment(verified);
    const published = object(
      await github(statusesPath, {
        state: "success",
        environment: "production",
        environment_url: PRODUCTION_URL,
        log_url: immutableUrl,
        description:
          "Verified Vercel READY revision, production alias and Postgres health.",
        auto_inactive: false,
      }),
    );
    if (
      published.state !== "success" ||
      published.environment_url !== PRODUCTION_URL
    )
      throw new RecorderError(
        "GitHub returned a mismatched deployment status.",
      );
    recorded = true;
  }
  return {
    sha: config.sha,
    deploymentId: verified.id,
    githubDeploymentId,
    url: PRODUCTION_URL,
    recorded,
  };
}

async function main() {
  if (process.env.GITHUB_EVENT_NAME !== "workflow_run")
    throw new RecorderError(
      "The production recorder requires a trusted workflow_run.",
    );
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  const event: unknown = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH ?? "", "utf8"),
  );
  const sha = trustedRevision(event, repository);
  console.log("Waiting for verified Vercel production evidence.");
  const result = await recordProductionRelease({
    sha,
    repository,
    vercelToken: process.env.VERCEL_TOKEN ?? "",
    githubToken: process.env.GITHUB_TOKEN ?? "",
  });
  console.log(JSON.stringify(result));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof RecorderError
        ? error.message
        : "Production recorder failed.",
    );
    process.exitCode = 1;
  });
}
