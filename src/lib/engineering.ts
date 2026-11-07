import { z } from "zod";
import { audit, DomainError, execute } from "./domain/workflow";
import { json, readJson } from "./http";
import { commandSchema } from "./schemas";
import { constantEqual } from "./security";
import { mutate, type Store } from "./store";

const actions = new Set([
  "start_reproduction",
  "propose_reproduction",
  "start_fix",
  "submit_fix",
]);

/** Separate service authority: no reporter answers, approvals or release writes. */
export async function engineeringApi(
  request: Request,
  parts: string[],
  store: Store,
) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!constantEqual(token, process.env.ENGINEERING_TOKEN ?? ""))
    throw new DomainError("Valid engineering credentials are required.", 401);
  if (
    request.method === "POST" &&
    parts.join("/") === "engineering/heartbeat"
  ) {
    const input = z
      .object({
        roomsConnected: z.number().int().min(0).max(4),
        provider: z.enum(["meta", "bedrock"]),
        model: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/),
        version: z
          .string()
          .min(1)
          .max(40)
          .regex(/^[a-zA-Z0-9._-]+$/),
      })
      .strict()
      .parse(await readJson(request));
    await mutate(store, "live", (ledger) => {
      ledger.engineeringHeartbeat = { ...input, at: new Date().toISOString() };
    });
    return json({ ok: true });
  }
  if (request.method === "GET" && parts.join("/") === "engineering/work") {
    const { ledger } = await store.read("live");
    const after = new URL(request.url).searchParams.get("after") ?? "";
    const work = Object.values(ledger.clusters)
      .filter((c) =>
        ["new", "reopened", "reproducing", "confirmed", "fixing"].includes(
          c.state,
        ),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((c) => c.id.localeCompare(after) > 0);
    return json({
      nextCursor: work.length > 100 ? work[99].id : null,
      clusters: work.slice(0, 100).map((c) => ({
        id: c.id,
        state: c.state,
        dossier: c.dossier,
        reporterConfirmedAt: c.reporterConfirmedAt,
        reproduction: c.reproduction,
        githubIssue: c.githubIssue,
        fix: c.fix && { prUrl: c.fix.prUrl, headSha: c.fix.headSha },
      })),
    });
  }
  if (request.method === "POST" && parts[1] === "bugs" && parts[2]) {
    const body = await readJson(request);
    if (parts[3] === "actions") {
      if (
        !body ||
        typeof body !== "object" ||
        !("type" in body) ||
        !actions.has(String(body.type))
      )
        throw new DomainError("Engineering cannot perform that action.", 403);
      const command = commandSchema.parse(body);
      const cluster = await mutate(store, "live", (ledger) =>
        execute(ledger, parts[2], command, {
          id: "AWS engineering runtime",
          role: "agent",
        }),
      );
      return json({ ok: true, state: cluster.state });
    }
    if (parts[3] === "notes") {
      const input = z
        .object({ summary: z.string().min(1).max(1500) })
        .strict()
        .parse(body);
      await mutate(store, "live", (ledger) => {
        const cluster = ledger.clusters[parts[2]];
        if (!cluster) throw new DomainError("Bug not found.", 404);
        audit(
          ledger,
          cluster,
          "engineering_note",
          "Engineering runtime update",
          input.summary,
          "AWS engineering runtime",
        );
      });
      return json({ ok: true });
    }
  }
  throw new DomainError("Engineering route not found.", 404);
}
