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
  }));
  const connected =
    ledger.workerHeartbeat &&
    Date.now() - Date.parse(ledger.workerHeartbeat.at) < 90000 &&
    ledger.workerHeartbeat.roomsConnected >= 2;
  return {
    mode,
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
        status:
          process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET
            ? "configured"
            : "disconnected",
        detail: process.env.TELEGRAM_BOT_TOKEN
          ? "Bot credentials configured"
          : "A bot token and forum group are required",
      },
    ],
  };
}
export type Workspace = ReturnType<typeof presentWorkspace>;
