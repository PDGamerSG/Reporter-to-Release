import { randomUUID } from "node:crypto";
import { digest, renderDossier, safeOutbound, sanitizeReport } from "./airlock";
import type { Actor, AuditEvent, Cluster, Command, Ledger, OutboxJob, Report, ReportInput, State } from "./types";
export type * from "./types";

export class DomainError extends Error { constructor(message: string, public status = 409) { super(message); } }
const now = () => new Date().toISOString();
export function emptyLedger(): Ledger { return { schemaVersion: 1, revision: 0, nextId: 1, clusters: {}, reports: {}, events: [], outbox: [], deliveries: {}, createdAt: now() }; }

export function audit(ledger: Ledger, cluster: Cluster, kind: string, title: string, body: string, actor: string): AuditEvent {
  const event = { id: randomUUID(), clusterId: cluster.id, kind, title, body: safeOutbound(body).slice(0, 2000), actor, at: now() };
  ledger.events.push(event);
  cluster.updatedAt = event.at;
  return event;
}

export function enqueue(ledger: Ledger, cluster: Cluster, kind: OutboxJob["kind"], channel: OutboxJob["channel"], body: string, reportId?: string) {
  const id = digest(`${cluster.id}:${kind}:${reportId ?? "engineering"}:${kind === "release" ? cluster.release?.sha : cluster.updatedAt}`);
  if (ledger.outbox.some(job => job.id === id)) return;
  ledger.outbox.push({ id, clusterId: cluster.id, reportId, kind, channel, body: safeOutbound(body), attempts: 0, createdAt: now(), dueAt: now() });
}

function tokens(title: string): Set<string> {
  return new Set(title.toLowerCase().replace(/coupons/g, "coupon").replace(/below zero|minus|negative/g, "negative").replace(/\b(?:the|a|an|is|it|my|when|with|to|after|makes|goes|in|on|and|does|not)\b/g, " ").match(/[\p{L}\p{N}]+/gu) ?? []);
}
function similarity(a: string, b: string) {
  const x = tokens(a), y = tokens(b);
  return [...x].filter(t => y.has(t)).length / Math.max(1, new Set([...x, ...y]).size);
}

export function intake(ledger: Ledger, input: ReportInput): Report {
  if (input.deliveryId && ledger.deliveries[input.deliveryId]) return ledger.reports[ledger.deliveries[input.deliveryId]];
  const rawHash = digest(`${input.title}\n${input.description}`);
  const prior = Object.values(ledger.reports).find(r => r.reporterId === input.reporterId && r.rawHash === rawHash);
  if (prior) { if (input.deliveryId) ledger.deliveries[input.deliveryId] = prior.id; return prior; }
  const recent = Object.values(ledger.reports).filter(r => r.reporterId === input.reporterId && Date.now() - Date.parse(r.createdAt) < 3600000);
  if (recent.length >= 10) throw new DomainError("You have reached the limit of 10 reports per hour. Try again later.", 429);
  const dossier = sanitizeReport(input);
  let cluster = dossier.safety.quarantined ? undefined : Object.values(ledger.clusters).find(c => c.state !== "quarantined" && c.state !== "verified" && c.component === dossier.component && similarity(c.title, dossier.title) >= 0.55);
  const duplicate = Boolean(cluster);
  if (!cluster) {
    const id = `R2R-${String(ledger.nextId++).padStart(4, "0")}`;
    cluster = { id, title: dossier.title, component: dossier.component, severity: dossier.severity, state: dossier.safety.quarantined ? "quarantined" : "new", reportIds: [], dossier, createdAt: now(), updatedAt: now(), assignee: "Concierge", labels: [dossier.component] };
    ledger.clusters[id] = cluster;
  }
  const report: Report = { id: randomUUID(), clusterId: cluster.id, source: input.source, reporterId: input.reporterId, alias: `Reporter ${Object.keys(ledger.reports).length + 1}`, rawHash, tokenHash: input.tokenHash, createdAt: now(), dossier, route: input.route };
  ledger.reports[report.id] = report;
  cluster.reportIds.push(report.id);
  if (input.deliveryId) ledger.deliveries[input.deliveryId] = report.id;
  audit(ledger, cluster, duplicate ? "duplicate_joined" : "report_received", duplicate ? "Another reporter joined this bug" : "Report received through the airlock", `${dossier.safety.piiRedacted.length} personal data categories redacted. ${dossier.safety.quarantined ? "Content quarantined." : "Only structured facts retained."}`, "Concierge");
  enqueue(ledger, cluster, "acknowledgement", "reporter", dossier.safety.quarantined ? "Your report needs a safety review. Please describe the steps and what went wrong without instructions for agents." : duplicate ? `Others reported this too. You have joined ${cluster.id} and will receive its release update.` : `Your report is recorded as ${cluster.id}. We will prove it before starting a fix.`, report.id);
  if (!duplicate && !dossier.safety.quarantined) enqueue(ledger, cluster, "dossier", "engineering", `${cluster.id}\n${renderDossier(dossier)}`);
  if (duplicate && cluster.state === "deployed" && cluster.release) enqueue(ledger, cluster, "release", "reporter", `${cluster.id} is live in ${cluster.release.version}. Does it work for you?`, report.id);
  return report;
}

export function riskTier(paths: string[]): 0 | 1 | 2 {
  if (paths.some(p => /(^|\/)(?:auth|payments?|billing|migrations?|\.github|security)(?:\/|\.)/i.test(p))) return 2;
  return paths.every(p => /(?:^docs\/|\.md$|^src\/ui\/copy\/)/.test(p)) ? 0 : 1;
}

function allowState(cluster: Cluster, allowed: State[]) { if (!allowed.includes(cluster.state)) throw new DomainError(`This action is unavailable while the bug is ${cluster.state.replaceAll("_", " ")}.`); }
function owner(actor: Actor) { if (actor.role !== "owner") throw new DomainError("A human owner must approve this action.", 403); }
function internal(actor: Actor) { if (actor.role !== "owner" && actor.role !== "agent") throw new DomainError("An engineering agent or owner is required.", 403); }
function reporter(ledger: Ledger, cluster: Cluster, id: string, actor: Actor): Report {
  const report = ledger.reports[id];
  if (!report || report.clusterId !== cluster.id || actor.role !== "reporter" || actor.id !== report.reporterId) throw new DomainError("Only this report's original reporter can confirm it.", 403);
  return report;
}

export function execute(ledger: Ledger, id: string, command: Command, actor: Actor): Cluster {
  const c = ledger.clusters[id];
  if (!c) throw new DomainError("Bug not found.", 404);
  switch (command.type) {
    case "start_reproduction":
      internal(actor); allowState(c, ["new", "reopened"]); c.state = "reproducing"; c.assignee = "Reproducer";
      audit(ledger, c, command.type, "Reproduction started", "The reproducer must provide a failing test before a fix can begin.", actor.id); break;
    case "propose_reproduction":
      internal(actor); allowState(c, ["reproducing"]);
      if (!command.testOutput.trim() || !command.testCommand.trim() || !command.steps.length) throw new DomainError("A failing test, its output and reproduction steps are required.", 400);
      c.reproduction = { ...command, summary: safeOutbound(command.summary), testOutput: safeOutbound(command.testOutput), createdAt: now() };
      c.state = "awaiting_reporter"; c.assignee = "Reporter";
      audit(ledger, c, command.type, "Failing test recorded; waiting for the reporter", command.summary, actor.id);
      c.reportIds.forEach(r => enqueue(ledger, c, "reproduction", "reporter", `${c.id}: ${safeOutbound(command.summary)} Is this the bug you saw?`, r)); break;
    case "confirm_reproduction": {
      const r = reporter(ledger, c, command.reportId, actor); allowState(c, ["awaiting_reporter", "confirmed"]);
      r.reproductionConfirmed = command.confirmed;
      c.state = command.confirmed ? "confirmed" : "reopened"; c.reporterConfirmedAt = command.confirmed ? now() : undefined; c.assignee = command.confirmed ? "Bug manager" : "Reproducer";
      audit(ledger, c, command.type, command.confirmed ? "Reporter confirmed the reproduction" : "Reporter rejected the reproduction", "The answer was checked against the original reporter's identity.", r.alias); break;
    }
    case "start_fix":
      internal(actor);
      if (c.state !== "confirmed" || !c.reporterConfirmedAt) throw new DomainError("Reporter confirmation of a failing reproduction is required before fixing.");
      c.state = "fixing"; c.assignee = "Fixer"; audit(ledger, c, command.type, "Confirmed bug handed to the fixer", "The fix room receives the failing test and sanitized dossier.", actor.id);
      enqueue(ledger, c, "fix", "engineering", `${c.id}: reporter confirmation recorded. Start the fix room.\n${renderDossier(c.dossier)}\nFailing test: ${c.reproduction?.testPath}`); break;
    case "submit_fix":
      internal(actor); allowState(c, ["fixing"]);
      if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(command.prUrl) || !/^[a-f\d]{40}$/i.test(command.headSha)) throw new DomainError("A valid GitHub pull request and full commit SHA are required.", 400);
      if (!command.changedFiles.length || !command.testOutput.trim()) throw new DomainError("Changed paths and passing regression output are required.", 400);
      c.fix = { ...command, summary: safeOutbound(command.summary), testOutput: safeOutbound(command.testOutput), risk: riskTier(command.changedFiles), approvals: [] };
      c.state = "review"; c.assignee = "Human owner"; audit(ledger, c, command.type, "Fix ready for human review", `PR #${command.prNumber}. Risk tier ${c.fix.risk}. Agents cannot merge.`, actor.id); break;
    case "approve_fix":
      owner(actor); allowState(c, ["review"]);
      if (!command.note.trim()) throw new DomainError("Record what you reviewed.", 400);
      if (!c.fix!.approvals.some(a => a.id === actor.id)) c.fix!.approvals.push({ id: actor.id, codeOwner: Boolean(actor.codeOwner), note: safeOutbound(command.note), at: now() });
      audit(ledger, c, command.type, "Human review recorded", command.note, actor.id); break;
    case "mark_merged": {
      if (actor.role !== "github") throw new DomainError("Only a verified GitHub merge event can record a merge.", 403);
      allowState(c, ["review"]);
      const fix = c.fix!;
      if (command.prNumber !== fix.prNumber) throw new DomainError("Pull request does not match this bug.");
      if (command.mergedByType !== "User") throw new DomainError("A human must merge the pull request.", 403);
      if (!fix.approvals.length) throw new DomainError("Human review is required before recording the merge.");
      if (fix.risk === 2 && (fix.approvals.length < 2 || !fix.approvals.some(a => a.codeOwner))) throw new DomainError("Sensitive paths require two human approvals, including a code owner.");
      fix.mergeSha = command.mergeSha; fix.mergedBy = command.mergedBy; c.state = "merged"; c.assignee = "Release relay";
      audit(ledger, c, command.type, "Human-merged pull request recorded", `PR #${fix.prNumber} merged. Reporters will be notified after production deployment.`, command.mergedBy); break;
    }
    case "deploy":
      if (actor.role !== "github") throw new DomainError("Only a verified deployment event can mark a release live.", 403);
      if (command.environment.toLowerCase() !== "production") throw new DomainError("Only a production deployment can notify reporters.");
      allowState(c, ["merged"]);
      if (c.fix?.mergeSha !== command.sha && !command.ancestryVerified) throw new DomainError("The deployed commit must contain this bug's merge commit.");
      if (!/^https:\/\//.test(command.url)) throw new DomainError("The production release needs an HTTPS URL.", 400);
      c.release = { sha: command.sha, url: command.url, version: command.version, deployedAt: now() }; c.state = "deployed"; c.assignee = "Reporters";
      audit(ledger, c, command.type, "Production deployment verified", `${command.version} is live. Every affected reporter has a queued notification.`, actor.id);
      c.reportIds.forEach(r => enqueue(ledger, c, "release", "reporter", `${c.id} is fixed in ${command.version} and is live now: ${command.url} Does it work for you?`, r)); break;
    case "verify_release": {
      const r = reporter(ledger, c, command.reportId, actor); allowState(c, ["deployed", "verified"]);
      if (!command.confirmed && (!command.evidence || command.evidence.trim().length < 8)) throw new DomainError("Describe what still goes wrong so we can reproduce it.", 400);
      r.releaseConfirmed = command.confirmed;
      if (command.confirmed) c.state = "verified";
      else {
        const evidence = sanitizeReport({ title: c.title, description: command.evidence! });
        c.state = "reopened"; c.reporterConfirmedAt = undefined; c.assignee = "Reproducer";
        c.reportIds.forEach(reportId => { ledger.reports[reportId].reproductionConfirmed = undefined; ledger.reports[reportId].releaseConfirmed = undefined; });
        enqueue(ledger, c, "reopen", "engineering", `${c.id} reopened by a reporter. Sanitized observation: ${evidence.actual}`);
      }
      audit(ledger, c, command.type, command.confirmed ? "Reporter verified the live fix" : "Reporter reopened the bug", command.confirmed ? "The person who experienced the bug confirmed the production fix." : "Previous confirmation cleared. A new reproduction is required.", r.alias); break;
    }
    case "release_quarantine": {
      owner(actor); allowState(c, ["quarantined"]);
      const clean = sanitizeReport(command);
      if (clean.safety.quarantined) throw new DomainError("The replacement facts still contain an instruction signal.", 400);
      c.dossier = clean; c.title = clean.title; c.component = clean.component; c.severity = clean.severity; c.state = "new";
      audit(ledger, c, command.type, "Owner supplied clean replacement facts", "Discarded content was not restored.", actor.id);
      enqueue(ledger, c, "dossier", "engineering", `${c.id}\n${renderDossier(clean)}`); break;
    }
    case "set_severity":
      owner(actor); c.severity = command.severity; audit(ledger, c, command.type, "Priority updated", `Severity set to ${command.severity}.`, actor.id); break;
  }
  return c;
}
