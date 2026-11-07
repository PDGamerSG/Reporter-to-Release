export type Source = "web" | "telegram" | "switch";
export type Severity = "low" | "medium" | "high" | "critical";
export type Component =
  "checkout" | "cart" | "search" | "account" | "interface" | "unknown";
export type State =
  | "new"
  | "reproducing"
  | "awaiting_reporter"
  | "confirmed"
  | "fixing"
  | "review"
  | "merged"
  | "deployed"
  | "verified"
  | "quarantined"
  | "reopened";
export interface Dossier {
  version: 1;
  title: string;
  component: Component;
  severity: Severity;
  steps: string[];
  expected: string;
  actual: string;
  environment: string;
  safety: { quarantined: boolean; signals: string[]; piiRedacted: string[] };
}
export interface Report {
  id: string;
  clusterId: string;
  source: Source;
  reporterId: string;
  alias: string;
  rawHash: string;
  tokenHash?: string;
  createdAt: string;
  dossier: Dossier;
  route?: { roomId: string; threadId?: string; platformUserId?: string };
  reproductionConfirmed?: boolean;
  releaseConfirmed?: boolean;
}
export interface Reproduction {
  summary: string;
  steps: string[];
  testCommand: string;
  testOutput: string;
  testPath: string;
  screenshotUrl?: string;
  createdAt: string;
}
export interface Fix {
  prUrl: string;
  prNumber: number;
  headSha: string;
  changedFiles: string[];
  summary: string;
  testOutput: string;
  risk: 0 | 1 | 2;
  approvals: {
    id: string;
    humanId?: string;
    codeOwner: boolean;
    note: string;
    at: string;
  }[];
  mergeSha?: string;
  mergedBy?: string;
}
export interface Triage {
  summary: string;
  severity: Severity;
  severityReason: string;
  component: Component;
  likelyCause: string;
  reproductionSteps: string[];
  regressionTest: string;
  missingInformation: string[];
  reporterMessage: string;
  confidence: "low" | "medium" | "high";
  model: string;
  createdAt: string;
  usage: {
    inputTokens: number;
    cachedTokens: number;
    outputTokens: number;
    costMicros: number;
  };
}
export interface AiUsage {
  spentMicros: number;
  calls: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reservations: { id: string; at: number; micros: number }[];
  recent: { at: number; client: string }[];
}
export interface Cluster {
  id: string;
  title: string;
  component: Component;
  severity: Severity;
  state: State;
  reportIds: string[];
  dossier: Dossier;
  createdAt: string;
  updatedAt: string;
  assignee: string;
  labels: string[];
  githubIssue?: { number: number; url: string };
  triage?: Triage;
  reproduction?: Reproduction;
  reporterConfirmedAt?: string;
  fix?: Fix;
  release?: { sha: string; url: string; version: string; deployedAt: string };
}
export interface AuditEvent {
  id: string;
  clusterId: string;
  kind: string;
  title: string;
  body: string;
  actor: string;
  at: string;
}
export interface OutboxJob {
  id: string;
  clusterId: string;
  reportId?: string;
  kind:
    | "dossier"
    | "acknowledgement"
    | "reproduction"
    | "fix"
    | "release"
    | "reopen";
  channel: "engineering" | "reporter";
  body: string;
  createdAt: string;
  attempts: number;
  dueAt: string;
  leaseId?: string;
  leaseUntil?: string;
  sentAt?: string;
  lastError?: string;
}
export interface Ledger {
  schemaVersion: 1;
  revision: number;
  nextId: number;
  clusters: Record<string, Cluster>;
  reports: Record<string, Report>;
  events: AuditEvent[];
  outbox: OutboxJob[];
  deliveries: Record<string, string>;
  createdAt: string;
  workerHeartbeat?: { at: string; roomsConnected: number; version: string };
  aiUsage?: AiUsage;
  githubLastEventAt?: string;
  productionDeployments?: {
    sha: string;
    url: string;
    version: string;
    recordedAt: string;
  }[];
}
export interface Actor {
  id: string;
  role: "owner" | "agent" | "reporter" | "github";
  codeOwner?: boolean;
  verifiedHumanId?: string;
}
export interface ReportInput {
  title: string;
  description: string;
  source: Source;
  reporterId: string;
  expected?: string;
  environment?: string;
  steps?: string[];
  tokenHash?: string;
  deliveryId?: string;
  route?: Report["route"];
}
export type Command =
  | { type: "start_reproduction" }
  | {
      type: "propose_reproduction";
      summary: string;
      steps: string[];
      testCommand: string;
      testOutput: string;
      testPath: string;
      screenshotUrl?: string;
    }
  | { type: "confirm_reproduction"; reportId: string; confirmed: boolean }
  | { type: "start_fix" }
  | {
      type: "submit_fix";
      prUrl: string;
      prNumber: number;
      headSha: string;
      changedFiles: string[];
      summary: string;
      testOutput: string;
    }
  | { type: "approve_fix"; note: string }
  | {
      type: "mark_merged";
      prNumber: number;
      mergeSha: string;
      mergedBy: string;
      mergedByType: string;
    }
  | {
      type: "deploy";
      sha: string;
      environment: string;
      url: string;
      version: string;
      ancestryVerified?: boolean;
    }
  | {
      type: "verify_release";
      reportId: string;
      confirmed: boolean;
      evidence?: string;
    }
  | { type: "release_quarantine"; title: string; description: string }
  | { type: "set_severity"; severity: Severity };
