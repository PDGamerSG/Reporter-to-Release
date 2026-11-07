import { randomUUID } from "node:crypto";
import { DomainError } from "./workflow";
import { safeOutbound } from "./airlock";
import type { Ledger } from "./types";

export function claimJobs(ledger: Ledger, limit = 10) {
  const now = Date.now();
  return ledger.outbox.filter(j => !j.sentAt && Date.parse(j.dueAt) <= now && (!j.leaseUntil || Date.parse(j.leaseUntil) < now)).slice(0, Math.min(limit, 25)).map(j => {
    j.leaseId = randomUUID(); j.leaseUntil = new Date(now + 60000).toISOString(); j.attempts += 1;
    return { ...j, route: j.reportId ? ledger.reports[j.reportId]?.route : undefined, source: j.reportId ? ledger.reports[j.reportId]?.source : undefined };
  });
}

export function acknowledgeJob(ledger: Ledger, id: string, leaseId: string, success: boolean, error?: string) {
  const job = ledger.outbox.find(j => j.id === id);
  if (!job) throw new DomainError("Notification not found.", 404);
  if (job.sentAt) return job;
  if (job.leaseId !== leaseId || !job.leaseUntil || Date.parse(job.leaseUntil) < Date.now()) throw new DomainError("The delivery lease is missing or expired.");
  if (success) { job.sentAt = new Date().toISOString(); job.lastError = undefined; }
  else {
    job.lastError = safeOutbound(error ?? "Delivery failed").slice(0, 240);
    job.dueAt = new Date(Date.now() + Math.min(3600000, 1000 * 2 ** Math.min(job.attempts, 12))).toISOString();
  }
  job.leaseId = undefined; job.leaseUntil = undefined;
  return job;
}
