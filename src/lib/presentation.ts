import { telegramConfigured } from "./integrations/telegram";
import { safeReporterText } from "./domain/airlock";
import type { Cluster, Ledger, Report, Triage } from "./domain/types";

/** Reporter-safe triage: billing figures stay on the server. */
export function presentTriage(triage: Triage) {
  const { costMicros: _cost, ...usage } = triage.usage;
  void _cost;
  return { ...triage, usage };
}
export type ReporterTriage = ReturnType<typeof presentTriage>;

export function presentReporterCluster(cluster: Cluster, report: Report) {
  const reproduction = cluster.reproduction;
  let releaseUrl = "";
  if (cluster.release) {
    const url = new URL(cluster.release.url);
    if (url.protocol === "https:" && !url.username && !url.password) {
      url.search = "";
      url.hash = "";
      releaseUrl = url.toString();
    }
  }
  return {
    id: cluster.id,
    title: safeReporterText(cluster.title),
    state: cluster.state,
    dossier: { actual: safeReporterText(report.dossier.actual) },
    triage: cluster.triage ? presentTriage(cluster.triage) : undefined,
    reproduction: reproduction
      ? {
          summary: safeReporterText(reproduction.summary),
          steps: reproduction.steps.map(safeReporterText),
        }
      : undefined,
    release: cluster.release
      ? {
          version: safeReporterText(cluster.release.version),
          url: releaseUrl,
          deployedAt: cluster.release.deployedAt,
        }
      : undefined,
  };
}
export type ReporterCluster = ReturnType<typeof presentReporterCluster>;

export function presentWorkspace(ledger: Ledger, mode: "demo" | "live") {
  const reports = Object.values(ledger.reports).map((r) => ({
    id: r.id,
    clusterId: r.clusterId,
    source: r.source,
    alias: r.alias,
    createdAt: r.createdAt,
    reproductionConfirmed: r.reproductionConfirmed,
    releaseConfirmed: r.releaseConfirmed,
    screenshots: r.screenshots?.length ?? 0,
  }));
  const connected =
    ledger.workerHeartbeat &&
    Date.now() - Date.parse(ledger.workerHeartbeat.at) < 90000 &&
    ledger.workerHeartbeat.roomsConnected >= 2;
  const heartbeat = mode === "live" ? ledger.engineeringHeartbeat : undefined;
  const heartbeatAge = heartbeat ? Date.now() - Date.parse(heartbeat.at) : NaN;
  const fresh = heartbeatAge >= 0 && heartbeatAge < 90000;
  const engineering = heartbeat
    ? {
        connected: fresh && heartbeat.roomsConnected === 4,
        fresh,
        roomsConnected: fresh ? heartbeat.roomsConnected : 0,
        provider: heartbeat.provider,
        model: heartbeat.model,
        lastSeenAt: heartbeat.at,
      }
    : null;
  return {
    mode,
    engineering,
    revision: ledger.revision,
    clusters: Object.values(ledger.clusters).map((cluster) =>
      cluster.triage
        ? { ...cluster, triage: presentTriage(cluster.triage) }
        : cluster,
    ),
    reports,
    events: ledger.events.slice(-300),
    outbox: ledger.outbox.map((j) => ({
      id: j.id,
      clusterId: j.clusterId,
      kind: j.kind,
      channel: j.channel,
      attempts: j.attempts,
      createdAt: j.createdAt,
      sentAt: j.sentAt,
      lastError: j.lastError,
    })),
    integrations: [
      {
        id: "database",
        name: "Postgres ledger",
        status: process.env.DATABASE_URL ? "connected" : "local",
        detail: process.env.DATABASE_URL
          ? "Durable storage with concurrent-write protection"
          : "Local development file storage",
      },
      {
        id: "switch",
        name: "Switch",
        status: connected ? "connected" : "disconnected",
        detail: connected
          ? "Public and engineering rooms connected"
          : "Waiting for the AWS worker and room connections",
      },
      {
        id: "engineering",
        name: "AWS engineering service",
        status:
          mode === "demo"
            ? "demo"
            : engineering?.connected
              ? "connected"
              : "disconnected",
        detail:
          mode === "demo"
            ? "Example roles only; live service status is hidden in the demo"
            : engineering?.fresh
              ? `${engineering.roomsConnected} of 4 role connections; ${engineering.provider === "meta" ? "Meta" : "Amazon Bedrock"} / ${engineering.model}. Model outcomes appear in each bug's audit trail.`
              : "Waiting for a fresh engineering heartbeat from AWS",
      },
      {
        id: "github",
        name: "GitHub",
        status: ledger.githubLastEventAt
          ? "connected"
          : process.env.GITHUB_WEBHOOK_SECRET
            ? "configured"
            : "disconnected",
        detail: ledger.githubLastEventAt
          ? `Last verified event ${ledger.githubLastEventAt}`
          : "Signed webhook receiver; waiting for its first event",
      },
      {
        id: "model",
        name: "Meta Model API",
        status: process.env.MODEL_API_KEY ? "configured" : "disconnected",
        detail: process.env.MODEL_API_KEY
          ? "Advisory AI triage through the server-side proxy, with a spending cap"
          : "Add MODEL_API_KEY to enable AI triage",
      },
      {
        id: "telegram",
        name: "Telegram",
        status: telegramConfigured() ? "configured" : "disconnected",
        detail: telegramConfigured()
          ? `Reporters can link a tracker to @${process.env.TELEGRAM_BOT_USERNAME}`
          : "A bot username and webhook secret are required",
      },
    ],
  };
}
export type Workspace = ReturnType<typeof presentWorkspace>;
