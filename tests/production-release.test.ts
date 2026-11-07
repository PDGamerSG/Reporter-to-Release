import { describe, expect, it } from "vitest";
import {
  recordProductionRelease,
  trustedRevision,
} from "../scripts/production-release";

const sha = "a".repeat(40);
const otherSha = "b".repeat(40);
const projectId = "prj_p7VIwQcUZo3uHYZeizYiFB4tqKgZ";
const teamId = "team_9DmQgMjE796WaejfWWU17kYK";
const deploymentId = "dpl_verified123";
const immutableHost = "reporter-to-release-abc123-example.vercel.app";
const productionHost = "reporter-to-release.pallabdas.me";
const config = {
  sha,
  repository: "acme/reporter-to-release",
  vercelToken: "test-vercel-credential",
  githubToken: "test-github-credential",
};

function workflowEvent() {
  return {
    action: "completed",
    workflow_run: {
      name: "Verify application",
      status: "completed",
      conclusion: "success",
      event: "push",
      head_branch: "main",
      head_sha: sha,
      head_repository: { full_name: "acme/reporter-to-release" },
    },
  };
}

function listedDeployment() {
  return {
    uid: deploymentId,
    name: "reporter-to-release",
    projectId,
    target: "production",
    readyState: "READY",
    state: "READY",
    url: immutableHost,
    meta: { githubCommitSha: sha },
    type: "LAMBDAS",
    created: 1794000000000,
    createdAt: 1794000000000,
    creator: { uid: "user_example" },
    inspectorUrl: "https://vercel.com/example/reporter-to-release/abc123",
  };
}

function deploymentDetails() {
  return {
    id: deploymentId,
    name: "reporter-to-release",
    project: { id: projectId, name: "reporter-to-release" },
    team: { id: teamId, name: "Example", slug: "example" },
    target: "production",
    readyState: "READY",
    url: immutableHost,
    gitSource: { type: "github", repoId: 123, ref: "main", sha },
    meta: { githubCommitSha: sha },
    alias: [productionHost],
    aliasAssigned: true,
  };
}

function aliasBinding() {
  return {
    uid: "alias_example",
    alias: productionHost,
    created: "2026-11-07T00:00:00.000Z",
    projectId,
    deploymentId,
    deployment: { id: deploymentId, url: immutableHost },
    redirect: null,
  };
}

type ApiObject = Record<string, unknown>;
type RequestLog = {
  url: URL;
  method: string;
  headers: Headers;
  redirect: RequestRedirect | undefined;
  body: ApiObject | undefined;
};
type BoundaryBehavior = {
  list: (attempt: number) => unknown;
  details: () => unknown;
  alias: (attempt: number) => unknown;
  health: (host: string) => unknown;
  healthStatus: number;
  statusFailures: number;
  createdDeployment: (body: ApiObject) => ApiObject;
  postedStatus: (body: ApiObject) => ApiObject;
  networkFailure: boolean;
};

function httpBoundary() {
  const requests: RequestLog[] = [];
  const deployments: ApiObject[] = [];
  const statuses: ApiObject[] = [];
  const deploymentWrites: ApiObject[] = [];
  const statusWrites: ApiObject[] = [];
  let time = 0;
  let listCount = 0;
  let aliasCount = 0;
  const behavior: BoundaryBehavior = {
    list: () => ({
      deployments: [listedDeployment()],
      pagination: { count: 1, next: null, prev: null },
    }),
    details: (): unknown => deploymentDetails(),
    alias: () => aliasBinding(),
    health: () => ({
      status: "ok",
      service: "Reporter-to-Release",
      storage: "postgres",
      version: "1.1.0",
    }),
    healthStatus: 200,
    statusFailures: 0,
    createdDeployment: (body: ApiObject): ApiObject => ({
      ...body,
      sha,
      id: 42,
    }),
    postedStatus: (body) => ({ ...body, id: 100 + statuses.length }),
    networkFailure: false,
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetcher: typeof fetch = async (input, init) => {
    if (behavior.networkFailure)
      throw new Error(`network failure ${config.vercelToken}`);
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body
      ? (JSON.parse(String(init.body)) as ApiObject)
      : undefined;
    requests.push({
      url,
      method,
      headers: new Headers(init?.headers),
      redirect: init?.redirect,
      body,
    });
    if (url.origin === "https://api.vercel.com") {
      if (url.pathname === "/v7/deployments")
        return json(behavior.list(++listCount));
      if (url.pathname === `/v13/deployments/${deploymentId}`)
        return json(behavior.details());
      if (url.pathname === `/v4/aliases/${productionHost}`)
        return json(behavior.alias(++aliasCount));
    }
    if (
      [immutableHost, productionHost].includes(url.hostname) &&
      url.pathname === "/api/health"
    )
      return json(behavior.health(url.hostname), behavior.healthStatus);
    if (url.origin === "https://api.github.com") {
      if (url.pathname === "/repos/acme/reporter-to-release/deployments") {
        if (method === "GET") return json(deployments);
        if (method === "POST" && body) {
          deploymentWrites.push(body);
          const deployment = behavior.createdDeployment(body);
          deployments.push(deployment);
          return json(deployment, 201);
        }
      }
      if (
        url.pathname ===
        "/repos/acme/reporter-to-release/deployments/42/statuses"
      ) {
        if (method === "GET") return json(statuses);
        if (method === "POST" && body) {
          statusWrites.push(body);
          if (behavior.statusFailures-- > 0)
            return json({ message: config.githubToken }, 500);
          statuses.unshift(behavior.postedStatus(body));
          return json(statuses[0], 201);
        }
      }
    }
    throw new Error(`Unexpected test boundary: ${method} ${url}`);
  };
  return {
    behavior,
    requests,
    deployments,
    statuses,
    deploymentWrites,
    statusWrites,
    dependencies: {
      fetch: fetcher,
      now: () => time,
      sleep: async (milliseconds: number) => {
        time += milliseconds;
      },
      maxWaitMs: 30,
      pollIntervalMs: 10,
    },
  };
}

describe("trusted production revision", () => {
  it("uses the full revision of the successful main push verification", () => {
    expect(trustedRevision(workflowEvent(), config.repository)).toBe(sha);
  });

  it.each([
    ["pull request", { event: "pull_request" }],
    ["failed checks", { conclusion: "failure" }],
    ["incomplete checks", { status: "in_progress" }],
    ["other branch", { head_branch: "feature" }],
    ["other workflow", { name: "Untrusted workflow" }],
    ["fork repository", { head_repository: { full_name: "attacker/fork" } }],
    ["abbreviated revision", { head_sha: "a".repeat(7) }],
  ])("rejects %s before reading credentials", (_name, change) => {
    const event = workflowEvent();
    Object.assign(event.workflow_run, change);
    expect(() => trustedRevision(event, config.repository)).toThrow(/trusted/i);
  });
});

describe("verified production recorder", () => {
  it("records exact-SHA production success only after both health probes and alias recheck", async () => {
    const boundary = httpBoundary();
    const result = await recordProductionRelease(config, boundary.dependencies);
    expect(result).toMatchObject({
      sha,
      deploymentId,
      githubDeploymentId: 42,
      recorded: true,
      url: "https://reporter-to-release.pallabdas.me",
    });
    expect(boundary.deploymentWrites).toHaveLength(1);
    expect(boundary.deploymentWrites[0]).toMatchObject({
      ref: sha,
      task: "verify:vercel-production",
      environment: "production",
      auto_merge: false,
      required_contexts: [],
      transient_environment: false,
      production_environment: true,
      payload: {
        recorder: "reporter-to-release/vercel-production-v1",
        vercelDeploymentId: deploymentId,
        vercelProjectId: projectId,
        immutableUrl: `https://${immutableHost}`,
      },
    });
    expect(boundary.statusWrites).toEqual([
      expect.objectContaining({
        state: "success",
        environment: "production",
        environment_url: "https://reporter-to-release.pallabdas.me",
        auto_inactive: false,
      }),
    ]);
    const firstWrite = boundary.requests.findIndex((r) => r.method === "POST");
    const checkedBeforeWriting = boundary.requests.slice(0, firstWrite);
    expect(
      checkedBeforeWriting
        .filter((r) => r.url.pathname === "/api/health")
        .map((r) => r.url.hostname),
    ).toEqual([immutableHost, productionHost]);
    expect(
      checkedBeforeWriting.filter((r) =>
        r.url.pathname.startsWith("/v4/aliases"),
      ).length,
    ).toBeGreaterThanOrEqual(2);
    for (const request of boundary.requests) {
      expect(request.redirect).toBe("error");
      if (request.url.origin === "https://api.vercel.com") {
        expect(request.method).toBe("GET");
        expect(request.url.searchParams.get("teamId")).toBe(teamId);
        expect(request.headers.get("authorization")).toBe(
          "Bearer test-vercel-credential",
        );
      } else if (request.url.origin === "https://api.github.com") {
        expect(request.headers.get("authorization")).toBe(
          "Bearer test-github-credential",
        );
      } else {
        expect(request.headers.has("authorization")).toBe(false);
        expect(request.headers.has("cookie")).toBe(false);
      }
    }
    const listing = boundary.requests.find(
      (r) => r.url.pathname === "/v7/deployments",
    )!;
    expect(listing.url.searchParams.get("sha")).toBe(sha);
    expect(listing.url.searchParams.get("projectId")).toBe(projectId);
    expect(listing.url.searchParams.get("target")).toBe("production");
  });

  it("waits for the exact deployment to become READY instead of treating checks as a release", async () => {
    const boundary = httpBoundary();
    boundary.behavior.list = (attempt) => ({
      deployments:
        attempt === 1
          ? []
          : [
              {
                ...listedDeployment(),
                readyState: attempt === 2 ? "BUILDING" : "READY",
              },
            ],
    });
    await expect(
      recordProductionRelease(config, boundary.dependencies),
    ).resolves.toMatchObject({ recorded: true });
    expect(
      boundary.requests.filter((r) => r.url.pathname === "/v7/deployments"),
    ).toHaveLength(3);
  });

  it.each([
    ["wrong revision", { meta: { githubCommitSha: otherSha } }],
    ["abbreviated revision", { meta: { githubCommitSha: sha.slice(0, 7) } }],
    ["preview target", { target: null }],
    ["building deployment", { readyState: "BUILDING" }],
    ["contradictory state", { state: "ERROR" }],
    ["wrong project", { projectId: "prj_someoneElse" }],
  ])(
    "never records %s returned by the filtered listing",
    async (_name, change) => {
      const boundary = httpBoundary();
      boundary.behavior.list = () => ({
        deployments: [{ ...listedDeployment(), ...change }],
      });
      await expect(
        recordProductionRelease(config, boundary.dependencies),
      ).rejects.toThrow(/timed out/i);
      expect(boundary.deploymentWrites).toEqual([]);
      expect(boundary.statusWrites).toEqual([]);
    },
  );

  it.each([
    ["wrong project", { project: { id: "prj_someoneElse" } }],
    ["wrong team", { team: { id: "team_someoneElse" } }],
    ["wrong deployment", { id: "dpl_another" }],
    ["wrong revision", { gitSource: { sha: otherSha } }],
    ["missing revision", { gitSource: undefined, meta: {} }],
    ["preview target", { target: null }],
    ["unready deployment", { readyState: "BUILDING" }],
    ["unsafe health hostname", { url: "attacker.example" }],
    ["health URL credentials", { url: "token@attacker.example" }],
  ])(
    "independently rejects detailed evidence with %s",
    async (_name, change) => {
      const boundary = httpBoundary();
      boundary.behavior.details = () => ({ ...deploymentDetails(), ...change });
      await expect(
        recordProductionRelease(config, boundary.dependencies),
      ).rejects.toThrow(/timed out/i);
      expect(boundary.statusWrites).toEqual([]);
      expect(boundary.deploymentWrites).toEqual([]);
    },
  );

  it.each([
    [
      "stale deployment",
      { deploymentId: "dpl_old", deployment: { id: "dpl_old" } },
    ],
    ["contradictory nested deployment", { deployment: { id: "dpl_old" } }],
    ["other project", { projectId: "prj_someoneElse" }],
    ["other alias", { alias: "another.example" }],
    ["redirect", { redirect: "https://another.example" }],
  ])(
    "never records a healthy custom hostname with %s",
    async (_name, change) => {
      const boundary = httpBoundary();
      boundary.behavior.alias = () => ({ ...aliasBinding(), ...change });
      await expect(
        recordProductionRelease(config, boundary.dependencies),
      ).rejects.toThrow(/timed out/i);
      expect(boundary.statusWrites).toEqual([]);
      expect(boundary.deploymentWrites).toEqual([]);
    },
  );

  it.each([
    [
      immutableHost,
      { status: "error", service: "Reporter-to-Release", storage: "postgres" },
    ],
    [
      productionHost,
      { status: "ok", service: "Another app", storage: "postgres" },
    ],
    [
      productionHost,
      { status: "ok", service: "Reporter-to-Release", storage: "local" },
    ],
  ])("rejects invalid health from %s", async (host, response) => {
    const boundary = httpBoundary();
    const healthy = boundary.behavior.health;
    boundary.behavior.health = (candidate) =>
      candidate === host ? response : healthy(candidate);
    await expect(
      recordProductionRelease(config, boundary.dependencies),
    ).rejects.toThrow(/timed out/i);
    expect(boundary.statusWrites).toEqual([]);
    expect(boundary.deploymentWrites).toEqual([]);
  });

  it("rejects a redirecting health response", async () => {
    const boundary = httpBoundary();
    boundary.behavior.healthStatus = 302;
    await expect(
      recordProductionRelease(config, boundary.dependencies),
    ).rejects.toThrow(/timed out/i);
    expect(boundary.statusWrites).toEqual([]);
  });

  it("rechecks alias binding after health to catch a concurrent promotion", async () => {
    const boundary = httpBoundary();
    boundary.behavior.alias = (attempt) => ({
      ...aliasBinding(),
      deploymentId: attempt === 1 ? deploymentId : "dpl_newer",
    });
    await expect(
      recordProductionRelease(config, boundary.dependencies),
    ).rejects.toThrow(/timed out/i);
    expect(boundary.deploymentWrites).toEqual([]);
    expect(boundary.statusWrites).toEqual([]);
  });

  it("does not announce success if the alias changes during GitHub publication", async () => {
    const boundary = httpBoundary();
    boundary.behavior.alias = (attempt) => ({
      ...aliasBinding(),
      deploymentId: attempt <= 2 ? deploymentId : "dpl_newer",
    });
    await expect(
      recordProductionRelease(config, boundary.dependencies),
    ).rejects.toThrow(/alias/i);
    expect(boundary.statusWrites).toEqual([]);
  });

  it("reuses its verified deployment and success status on rerun", async () => {
    const boundary = httpBoundary();
    await recordProductionRelease(config, boundary.dependencies);
    await expect(
      recordProductionRelease(config, boundary.dependencies),
    ).resolves.toMatchObject({ githubDeploymentId: 42, recorded: false });
    expect(boundary.deploymentWrites).toHaveLength(1);
    expect(boundary.statusWrites).toHaveLength(1);
    expect(
      boundary.requests.filter((r) => r.url.pathname === "/api/health").length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("resumes a created deployment after GitHub status publication fails", async () => {
    const boundary = httpBoundary();
    boundary.behavior.statusFailures = 1;
    await expect(
      recordProductionRelease(config, boundary.dependencies),
    ).rejects.toThrow(/GitHub.*500/);
    await recordProductionRelease(config, boundary.dependencies);
    expect(boundary.deploymentWrites).toHaveLength(1);
    expect(boundary.statuses).toHaveLength(1);
  });

  it("refuses a GitHub deployment response for another revision", async () => {
    const boundary = httpBoundary();
    boundary.behavior.createdDeployment = (body) => ({
      ...body,
      id: 42,
      sha: otherSha,
    });
    await expect(
      recordProductionRelease(config, boundary.dependencies),
    ).rejects.toThrow(/GitHub.*deployment/i);
    expect(boundary.statusWrites).toEqual([]);
  });

  it("does not claim publication when GitHub returns a pending status", async () => {
    const boundary = httpBoundary();
    boundary.behavior.postedStatus = (body) => ({ ...body, state: "pending" });
    await expect(
      recordProductionRelease(config, boundary.dependencies),
    ).rejects.toThrow(/GitHub.*status/i);
  });

  it("bounds waiting and keeps dependency error text and credentials out of errors", async () => {
    const boundary = httpBoundary();
    boundary.behavior.networkFailure = true;
    let caught: unknown;
    try {
      await recordProductionRelease(config, boundary.dependencies);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(String(caught)).toMatch(/timed out/i);
    expect(String(caught)).not.toContain(config.vercelToken);
    expect(String(caught)).not.toContain(config.githubToken);
  });

  it("rejects malformed revision input without any network request", async () => {
    const boundary = httpBoundary();
    await expect(
      recordProductionRelease(
        { ...config, sha: "main" },
        boundary.dependencies,
      ),
    ).rejects.toThrow(/revision/i);
    expect(boundary.requests).toEqual([]);
  });
});
