"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import type { AuditEvent } from "@/lib/domain/types";
import type { ReporterCluster } from "@/lib/presentation";
import { PublicHeader } from "./public-header";
import { Journey, StateBadge, niceDate } from "./ui";
type Tracking = {
  mode: "demo" | "live";
  cluster: ReporterCluster;
  report: {
    id: string;
    alias: string;
    createdAt: string;
    reproductionConfirmed?: boolean;
    releaseConfirmed?: boolean;
  };
  events: AuditEvent[];
};
async function fetchTracking(
  reportId: string,
  answer?: { phase: string; confirmed: boolean; evidence?: string },
): Promise<Tracking> {
  const token = window.location.hash.slice(1);
  const mode =
    new URLSearchParams(window.location.search).get("mode") === "demo"
      ? "demo"
      : "live";
  const response = await fetch(`/api/track/${reportId}?mode=${mode}`, {
    method: answer ? "POST" : "GET",
    headers: { "x-reporter-token": token, "Content-Type": "application/json" },
    ...(answer ? { body: JSON.stringify(answer) } : {}),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error);
  return value;
}
export function Tracker({ reportId }: { reportId: string }) {
  const [data, setData] = useState<Tracking>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [notice, setNotice] = useState("");
  const request = useCallback(
    async (answer?: {
      phase: string;
      confirmed: boolean;
      evidence?: string;
    }) => {
      setData(await fetchTracking(reportId, answer));
      setError("");
      setLoading(false);
    },
    [reportId],
  );
  useEffect(() => {
    let active = true;
    fetchTracking(reportId)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reportId]);
  async function answer(confirmed: boolean) {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      await request({
        phase:
          data.cluster.state === "awaiting_reporter"
            ? "reproduction"
            : "release",
        confirmed,
        evidence: confirmed
          ? undefined
          : evidence || "The original reproduction still fails for me.",
      });
      setRejecting(false);
      setNotice(
        confirmed
          ? "Your confirmation is recorded. Thank you for closing the loop."
          : "Your report has reopened. The team will investigate again.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your answer could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="public-shell">
      <PublicHeader />
      <main id="main" className="public-content">
        <div className="public-intro">
          <span className="public-intro-icon">
            <LockKeyhole size={23} />
          </span>
          <h1>
            Your report.
            <br />
            The whole journey.
          </h1>
          <p>
            This private page keeps you connected to the evidence, the fix, and
            the release.
          </p>
        </div>
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        {loading && (
          <div className="loading-workspace">
            <LoaderCircle size={25} className="spin" />
            <p>Finding your report…</p>
          </div>
        )}
        {data && (
          <section className="public-card">
            <div className="tracking-header">
              <div>
                <span className="bug-id">
                  {data.cluster.id}
                  {data.mode === "demo" ? " · Demonstration" : ""}
                </span>
                <h2>{data.cluster.title}</h2>
              </div>
              <StateBadge state={data.cluster.state} />
            </div>
            <div className="tracking-body">
              <Journey cluster={data.cluster} />
              {notice && (
                <div className="sanitized-note" role="status">
                  <CheckCircle2 size={17} />
                  {notice}
                </div>
              )}
              {data.cluster.state === "awaiting_reporter" && (
                <div className="tracking-actions">
                  <h3>
                    <MessageCircle size={16} /> Is this the bug you saw?
                  </h3>
                  <p>{data.cluster.reproduction?.summary}</p>
                  <ol className="small-muted">
                    {data.cluster.reproduction?.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  <div className="button-row">
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => answer(true)}
                    >
                      <Check size={15} />
                      Yes, that’s my bug
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => answer(false)}
                    >
                      <X size={15} />
                      That’s different
                    </button>
                  </div>
                </div>
              )}
              {["deployed", "verified"].includes(data.cluster.state) &&
                !data.report.releaseConfirmed && (
                  <div className="tracking-actions">
                    <h3>The fix is live. Does it work for you?</h3>
                    <p>
                      {data.cluster.release?.version} is deployed. Try the same
                      steps again before confirming.
                    </p>
                    {data.cluster.release && (
                      <a
                        className="text-link"
                        href={data.cluster.release.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open the live release
                      </a>
                    )}
                    {rejecting && (
                      <label className="small-muted">
                        What still goes wrong?
                        <textarea
                          value={evidence}
                          onChange={(e) => setEvidence(e.target.value)}
                          minLength={8}
                          placeholder="Describe what you tried and what happened."
                        />
                      </label>
                    )}
                    <div className="button-row">
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => answer(true)}
                      >
                        <Check size={15} />
                        The fix works
                      </button>
                      <button
                        className="button secondary"
                        disabled={
                          busy || (rejecting && evidence.trim().length < 8)
                        }
                        onClick={() =>
                          rejecting ? answer(false) : setRejecting(true)
                        }
                      >
                        {rejecting
                          ? "Reopen with this evidence"
                          : "I still see the bug"}
                      </button>
                    </div>
                  </div>
                )}
              {data.report.releaseConfirmed && (
                <div className="sanitized-note">
                  <ShieldCheck size={18} />
                  You confirmed the live fix. This is what a closed loop looks
                  like.
                </div>
              )}
              <h3>What we heard</h3>
              <p>{data.cluster.dossier.actual}</p>
              <h3>The evidence trail</h3>
              <div className="detail-activity">
                {[...data.events].reverse().map((event) => (
                  <div className="timeline-event" key={event.id}>
                    <span className="timeline-marker" />
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.body}</p>
                      <small>{niceDate(event.at)}</small>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="button secondary"
                onClick={() => request().catch((e) => setError(e.message))}
              >
                <RefreshCw size={13} />
                Check for updates
              </button>
            </div>
          </section>
        )}
        <p className="public-footer">
          Keep this link private. It grants access to your report and
          confirmations.
          <br />
          Team Vulcan · Reporter-to-Release
        </p>
      </main>
    </div>
  );
}
