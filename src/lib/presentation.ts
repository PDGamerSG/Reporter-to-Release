import type { Ledger } from "./domain/types";

export function presentWorkspace(ledger: Ledger, mode: "demo" | "live") {
  const reports = Object.values(ledger.reports).map(r => ({ id: r.id, clusterId: r.clusterId, source: r.source, alias: r.alias, createdAt: r.createdAt, reproductionConfirmed: r.reproductionConfirmed, releaseConfirmed: r.releaseConfirmed }));
  const connected = ledger.workerHeartbeat && Date.now() - Date.parse(ledger.workerHeartbeat.at) < 90000 && ledger.workerHeartbeat.roomsConnected >= 2;
  return {
    mode, revision: ledger.revision, clusters: Object.values(ledger.clusters), reports,
    events: ledger.events.slice(-300),
    outbox: ledger.outbox.map(j => ({ id: j.id, clusterId: j.clusterId, kind: j.kind, channel: j.channel, attempts: j.attempts, createdAt: j.createdAt, sentAt: j.sentAt, lastError: j.lastError })),
    integrations: [
      { id: "database", name: "Postgres ledger", status: process.env.DATABASE_URL ? "connected" : "local", detail: process.env.DATABASE_URL ? "Durable storage with concurrent-write protection" : "Local development file storage" },
      { id: "switch", name: "Switch", status: connected ? "connected" : "disconnected", detail: connected ? "Public and engineering rooms connected" : "Waiting for the AWS worker and room connections" },
      { id: "github", name: "GitHub", status: ledger.githubLastEventAt ? "connected" : process.env.GITHUB_WEBHOOK_SECRET ? "configured" : "disconnected", detail: ledger.githubLastEventAt ? `Last verified event ${ledger.githubLastEventAt}` : "Signed webhook receiver; waiting for its first event" },
      { id: "telegram", name: "Telegram", status: process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET ? "configured" : "disconnected", detail: process.env.TELEGRAM_BOT_TOKEN ? "Bot credentials configured" : "A bot token and forum group are required" },
    ],
  };
}
export type Workspace = ReturnType<typeof presentWorkspace>;
