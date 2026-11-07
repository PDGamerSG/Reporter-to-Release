import { randomBytes } from "node:crypto";
import { z } from "zod";
import { advanceDemo, seedDemo } from "./demo";
import { digest, renderDossier, safeReporterText } from "./domain/airlock";
import { acknowledgeJob, claimJobs } from "./domain/outbox";
import { DomainError, execute, intake } from "./domain/workflow";
import {
  checkOrigin,
  context,
  fail,
  json,
  readJson,
  type Context,
} from "./http";
import { githubRequest, githubWebhook } from "./integrations/github";
import { presentReporterCluster, presentWorkspace } from "./presentation";
import { commandSchema, reporterAnswerSchema, reportSchema } from "./schemas";
import { constantEqual, identity, sessionSecret, signValue } from "./security";
import { getStore, mutate, type Store } from "./store";

async function initializeDemo(store: Store, ctx: Context) {
  if (ctx.mode !== "demo" || (await store.read(ctx.key)).version > 0) return;
  await mutate(store, ctx.key, (ledger) => {
    if (ledger.revision === 0) Object.assign(ledger, seedDemo());
  });
}
function requireWorker(request: Request) {
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!constantEqual(supplied, process.env.WORKER_TOKEN ?? ""))
    throw new DomainError("Valid worker credentials are required.", 401);
}
function owner(ctx: Context) {
  if (ctx.mode !== "live")
    throw new DomainError(
      "Sign in as the live workspace owner to use this action.",
      403,
    );
}

async function createIssue(store: Store, id: string) {
  const cluster = (await store.read("live")).ledger.clusters[id];
  if (!cluster || cluster.state === "quarantined")
    throw new DomainError("Only a clean dossier can be filed.", 409);
  if (cluster.githubIssue) return cluster.githubIssue;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository)
    throw new DomainError("GITHUB_REPOSITORY is not configured.", 503);
  const search = await (
    await githubRequest(
      `/search/issues?q=${encodeURIComponent(`repo:${repository} is:issue in:title "${id}"`)}`,
    )
  ).json();
  const issue =
    search.items?.find((i: { title: string }) =>
      i.title.startsWith(`[${id}]`),
    ) ??
    (await (
      await githubRequest(`/repos/${repository}/issues`, {
        method: "POST",
        body: JSON.stringify({
          title: `[${id}] ${cluster.title}`,
          body: `${renderDossier(cluster.dossier)}\n\nReporter-to-Release ledger: ${id}\nOnly sanitized report facts are included. Human review and reporter confirmation are required.`,
        }),
      })
    ).json());
  const result = { number: Number(issue.number), url: String(issue.html_url) };
  await mutate(store, "live", (ledger) => {
    ledger.clusters[id].githubIssue = result;
  });
  return result;
}

async function workerApi(request: Request, parts: string[], store: Store) {
  requireWorker(request);
  if (request.method !== "POST")
    throw new DomainError("Use POST for worker operations.", 405);
  const body = await readJson(request);
  if (parts[1] === "heartbeat") {
    const input = z
      .object({
        roomsConnected: z.number().int().min(0).max(20),
        version: z.string().max(40),
      })
      .parse(body);
    await mutate(store, "live", (ledger) => {
      ledger.workerHeartbeat = { ...input, at: new Date().toISOString() };
    });
    return json({ ok: true });
  }
  if (parts[1] === "reports") {
    const input = reportSchema
      .extend({
        source: z.enum(["switch", "telegram"]),
        platformUserId: z.string().min(1).max(200),
        roomId: z.string().min(1).max(200),
        threadId: z.string().max(200).optional(),
        deliveryId: z.string().min(1).max(300),
      })
      .parse(body);
    const report = await mutate(store, "live", (ledger) =>
      intake(ledger, {
        ...input,
        reporterId: identity(input.source, input.platformUserId),
        route: {
          roomId: input.roomId,
          threadId: input.threadId,
          platformUserId: input.platformUserId,
        },
        deliveryId: `${input.source}:${input.deliveryId}`,
      }),
    );
    return json(
      {
        reportId: report.id,
        clusterId: report.clusterId,
        quarantined: report.dossier.safety.quarantined,
      },
      201,
    );
  }
  if (parts[1] === "answers") {
    const input = reporterAnswerSchema
      .extend({
        reportId: z.string().uuid(),
        platformUserId: z.string().min(1),
        source: z.enum(["switch", "telegram"]),
      })
      .parse(body);
    const updated = await mutate(store, "live", (ledger) => {
      const report = ledger.reports[input.reportId];
      if (!report || report.source !== input.source)
        throw new DomainError("Report not found.", 404);
      return execute(
        ledger,
        report.clusterId,
        input.phase === "reproduction"
          ? {
              type: "confirm_reproduction",
              reportId: report.id,
              confirmed: input.confirmed,
            }
          : {
              type: "verify_release",
              reportId: report.id,
              confirmed: input.confirmed,
              evidence: input.evidence,
            },
        { id: identity(input.source, input.platformUserId), role: "reporter" },
      );
    });
    return json({ ok: true, state: updated.state });
  }
  if (parts[1] === "bugs" && parts[3] === "actions") {
    const command = commandSchema.parse(body);
    if (
      ["approve_fix", "release_quarantine", "set_severity"].includes(
        command.type,
      )
    )
      throw new DomainError("The worker cannot approve a human action.", 403);
    await mutate(store, "live", (ledger) =>
      execute(ledger, parts[2], command, {
        id: "Switch engineering agent",
        role: "agent",
      }),
    );
    return json({ ok: true });
  }
  if (parts[1] === "bugs" && parts[3] === "issue")
    return json(await createIssue(store, parts[2]));
  if (parts[1] === "outbox" && parts[2]) {
    const input = z
      .object({
        leaseId: z.string().uuid(),
        success: z.boolean(),
        error: z.string().max(1000).optional(),
      })
      .parse(body);
    await mutate(store, "live", (ledger) =>
      acknowledgeJob(
        ledger,
        parts[2],
        input.leaseId,
        input.success,
        input.error,
      ),
    );
    return json({ ok: true });
  }
  if (parts[1] === "outbox")
    return json({
      jobs: await mutate(store, "live", (ledger) => claimJobs(ledger, 15)),
    });
  throw new DomainError("Worker route not found.", 404);
}

export async function handleApi(
  request: Request,
  parts: string[],
  store: Store = getStore(),
): Promise<Response> {
  try {
    const method = request.method;
    if (parts.join("/") === "health" && method === "GET") {
      await store.read("live");
      return json({
        status: "ok",
        service: "Reporter-to-Release",
        storage: process.env.DATABASE_URL ? "postgres" : "local",
        version: "1.0.0",
      });
    }
    if (parts.join("/") === "webhooks/github" && method === "POST")
      return await githubWebhook(request, store);
    if (parts[0] === "worker") return await workerApi(request, parts, store);
    if (method !== "GET" && method !== "HEAD") checkOrigin(request);
    const ctx = context(request);

    if (parts[0] === "auth" && method === "POST") {
      const { token } = z
        .object({ token: z.string().min(1).max(300) })
        .strict()
        .parse(await readJson(request));
      const bucket = `login:${identity("login", request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local")}`;
      await mutate(store, bucket, (ledger) => {
        ledger.events = ledger.events.filter(
          (e) => Date.now() - Date.parse(e.at) < 600000,
        );
        if (ledger.events.length >= 10)
          throw new DomainError(
            "Too many sign-in attempts. Try again in 10 minutes.",
            429,
          );
        ledger.events.push({
          id: randomBytes(8).toString("hex"),
          clusterId: "auth",
          kind: "attempt",
          title: "Sign-in attempt",
          body: "",
          actor: "anonymous",
          at: new Date().toISOString(),
        });
      });
      if (!constantEqual(token, process.env.ADMIN_TOKEN ?? ""))
        throw new DomainError("The owner access key is incorrect.", 401);
      const response = json({ ok: true });
      response.headers.append(
        "Set-Cookie",
        `r2r_owner=${signValue({ id: "owner", expires: Date.now() + 28800000 }, sessionSecret())}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
      );
      return response;
    }
    if (parts[0] === "auth" && method === "DELETE") {
      const response = json({ ok: true });
      response.headers.append(
        "Set-Cookie",
        "r2r_owner=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
      );
      return response;
    }

    if (parts[0] === "track" && parts[1]) {
      const key =
        new URL(request.url).searchParams.get("mode") === "demo"
          ? ctx.key
          : "live";
      const snapshot = (await store.read(key)).ledger;
      const report = snapshot.reports[parts[1]];
      if (
        !report ||
        !constantEqual(
          digest(request.headers.get("x-reporter-token") ?? ""),
          report.tokenHash ?? "",
        )
      )
        throw new DomainError(
          "This tracking link is invalid or has expired. Use the complete private link you received.",
          403,
        );
      if (method === "POST") {
        const answer = reporterAnswerSchema.parse(await readJson(request));
        await mutate(store, key, (ledger) =>
          execute(
            ledger,
            report.clusterId,
            answer.phase === "reproduction"
              ? {
                  type: "confirm_reproduction",
                  reportId: report.id,
                  confirmed: answer.confirmed,
                }
              : {
                  type: "verify_release",
                  reportId: report.id,
                  confirmed: answer.confirmed,
                  evidence: answer.evidence,
                },
            { id: report.reporterId, role: "reporter" },
          ),
        );
      }
      const latest = (await store.read(key)).ledger;
      return json(
        {
          mode: key === "live" ? "live" : "demo",
          cluster: presentReporterCluster(
            latest.clusters[report.clusterId],
            latest.reports[report.id],
          ),
          report: {
            id: report.id,
            alias: report.alias,
            createdAt: report.createdAt,
            reproductionConfirmed:
              latest.reports[report.id].reproductionConfirmed,
            releaseConfirmed: latest.reports[report.id].releaseConfirmed,
          },
          events: latest.events
            .filter((e) => e.clusterId === report.clusterId)
            .map((e) => ({
              ...e,
              title: safeReporterText(e.title),
              body: safeReporterText(e.body),
              actor: e.actor === "Concierge" ? "Concierge" : "Bug desk",
            })),
        },
        200,
        ctx,
      );
    }

    if (parts[0] === "intake" && method === "POST") {
      const body = reportSchema.parse(await readJson(request));
      const token = randomBytes(32).toString("base64url");
      const reporterId = identity(
        "web",
        request.headers.get("x-forwarded-for")?.split(",")[0] ?? ctx.id,
      );
      const report = await mutate(store, "live", (ledger) =>
        intake(ledger, {
          ...body,
          source: "web",
          reporterId,
          tokenHash: digest(token),
        }),
      );
      if (report.tokenHash !== digest(token))
        throw new DomainError(
          "This report is already recorded. Please use your existing tracking link.",
        );
      return json(
        {
          reportId: report.id,
          clusterId: report.clusterId,
          trackingToken: token,
          mode: "live",
          quarantined: report.dossier.safety.quarantined,
        },
        201,
        ctx,
      );
    }

    await initializeDemo(store, ctx);
    if (parts[0] === "workspace" && method === "GET")
      return json(
        presentWorkspace((await store.read(ctx.key)).ledger, ctx.mode),
        200,
        ctx,
      );
    if (parts[0] === "reports" && method === "POST") {
      const body = reportSchema.parse(await readJson(request));
      const token = randomBytes(32).toString("base64url");
      const report = await mutate(store, ctx.key, (ledger) =>
        intake(ledger, {
          ...body,
          source: "web",
          reporterId: identity(
            "web",
            `${ctx.id}:${digest(body.title + body.description)}`,
          ),
          tokenHash: digest(token),
        }),
      );
      if (report.tokenHash !== digest(token))
        throw new DomainError(
          "This report is already recorded. Use your existing tracking link.",
        );
      return json(
        {
          reportId: report.id,
          clusterId: report.clusterId,
          trackingToken: token,
          mode: ctx.mode,
          quarantined: report.dossier.safety.quarantined,
        },
        201,
        ctx,
      );
    }
    if (parts[0] === "demo" && parts[1] === "reset" && method === "POST") {
      if (ctx.mode !== "demo")
        throw new DomainError(
          "Only demonstration workspaces can be reset.",
          403,
        );
      await mutate(store, ctx.key, (ledger) =>
        Object.assign(ledger, seedDemo()),
      );
      return json({ ok: true }, 200, ctx);
    }
    if (
      parts[0] === "bugs" &&
      parts[1] &&
      parts[2] === "demo-step" &&
      method === "POST"
    ) {
      if (ctx.mode !== "demo")
        throw new DomainError(
          "Demonstration controls are disabled in the live workspace.",
          403,
        );
      await mutate(store, ctx.key, (ledger) => advanceDemo(ledger, parts[1]));
      return json({ ok: true }, 200, ctx);
    }
    if (
      parts[0] === "bugs" &&
      parts[1] &&
      parts[2] === "actions" &&
      method === "POST"
    ) {
      owner(ctx);
      const command = commandSchema.parse(await readJson(request));
      await mutate(store, "live", (ledger) =>
        execute(ledger, parts[1], command, {
          id: "Workspace owner",
          role: "owner",
          codeOwner: true,
        }),
      );
      return json({ ok: true });
    }
    if (parts[0] === "export" && method === "GET") {
      const workspace = presentWorkspace(
        (await store.read(ctx.key)).ledger,
        ctx.mode,
      );
      const response = json(
        { exportedAt: new Date().toISOString(), ...workspace },
        200,
        ctx,
      );
      response.headers.set(
        "Content-Disposition",
        'attachment; filename="reporter-to-release-audit.json"',
      );
      return response;
    }
    throw new DomainError("API route not found.", 404);
  } catch (error) {
    return fail(error);
  }
}
