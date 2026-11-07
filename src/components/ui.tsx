"use client";
import { useEffect, useRef } from "react";
import { X, ArrowUpRight, Globe, MessageCircle, Radio, Check, Circle, GitPullRequest, FlaskConical, ShieldCheck, Rocket, MessageSquare } from "lucide-react";
import type { Cluster, Source, State } from "@/lib/domain/types";

export const stateLabels: Record<State, string> = { new: "New report", reproducing: "Reproducing", awaiting_reporter: "Waiting for reporter", confirmed: "Confirmed", fixing: "Fix in progress", review: "Human review", merged: "Awaiting deploy", deployed: "Awaiting verification", verified: "Verified", quarantined: "Quarantined", reopened: "Reopened" };
export function StateBadge({ state }: { state: State }) { return <span className={`status-badge state-${state}`}><span />{stateLabels[state]}</span>; }
export function SourceIcon({ source }: { source: Source }) { return source === "web" ? <Globe size={13} /> : source === "telegram" ? <MessageCircle size={13} /> : <Radio size={13} />; }
export function SourceLabel({ source }: { source: Source }) { return <span className={`source-label source-${source}`}><SourceIcon source={source} />{source === "web" ? "Web" : source === "telegram" ? "Telegram" : "Switch"}</span>; }
export function ago(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(value)) / 60000));
  return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}
export function niceDate(value: string) { return new Date(value).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }

export function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (!dialog?.open) dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? "modal-wide" : ""}`} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>{children}</dialog>;
}

const stages = [{ label: "Report", icon: MessageSquare }, { label: "Reproduce", icon: FlaskConical }, { label: "Confirm", icon: Check }, { label: "Fix & review", icon: GitPullRequest }, { label: "Release", icon: Rocket }, { label: "Verify", icon: ShieldCheck }];
export function Journey({ cluster }: { cluster: Cluster }) {
  const index: Record<State, number> = { new: 0, quarantined: 0, reopened: 1, reproducing: 1, awaiting_reporter: 2, confirmed: 2, fixing: 3, review: 3, merged: 4, deployed: 4, verified: 5 };
  const current = index[cluster.state];
  return <div className="journey" aria-label="Report lifecycle">{stages.map(({ label, icon: Icon }, i) => <div key={label} className={`journey-step ${i < current || cluster.state === "verified" ? "complete" : i === current ? "current" : ""}`}><span className="journey-node">{i < current || cluster.state === "verified" ? <Check size={14} /> : <Icon size={14} />}</span><span>{label}</span></div>)}</div>;
}
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) { return <div className="empty-state"><Circle size={30} strokeWidth={1.3} /><h3>{title}</h3><p>{children}</p></div>; }
export function External({ href, children }: { href: string; children: React.ReactNode }) { return <a href={href} target="_blank" rel="noreferrer" className="text-link">{children}<ArrowUpRight size={13} /></a>; }
