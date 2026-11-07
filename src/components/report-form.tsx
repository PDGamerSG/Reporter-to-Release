"use client";
import { useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Copy,
  LockKeyhole,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
export interface ReportResult {
  reportId: string;
  clusterId: string;
  trackingToken: string;
  mode: "demo" | "live";
  quarantined: boolean;
}
export function ReportForm({
  mode = "live",
  onCreated,
  initialTitle = "",
  initialDescription = "",
}: {
  mode?: "live" | "demo";
  onCreated?: (result: ReportResult) => void;
  initialTitle?: string;
  initialDescription?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReportResult>();
  const [copied, setCopied] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        mode === "demo" ? "/api/reports?mode=demo" : "/api/intake",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.get("title"),
            description: data.get("description"),
            expected: data.get("expected") || undefined,
            environment: data.get("environment") || undefined,
          }),
        },
      );
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setResult(json);
      onCreated?.(json);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your report could not be sent. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (result) {
    const path = `/track/${result.reportId}?mode=${result.mode}#${result.trackingToken}`;
    return (
      <div className="report-success">
        <span className="success-icon">
          <CheckCircle2 size={30} />
        </span>
        <h3>
          {result.quarantined
            ? "Your report is held for review"
            : "Your report has a place to go."}
        </h3>
        <p>
          {result.clusterId} is recorded.{" "}
          {result.quarantined
            ? "An owner will need clean facts before engineering can proceed."
            : "We’ll keep the evidence, the fix, and the release in one place."}
        </p>
        <div className="private-link">
          <LockKeyhole size={16} />
          <div>
            <strong>Keep your private tracking link</strong>
            <span>
              It lets you confirm the reproduction and the live fix. Anyone with
              this link can act as you.
            </span>
          </div>
        </div>
        <div className="button-row">
          <a className="button primary" href={path}>
            Track your report
            <ArrowUpRight size={15} />
          </a>
          <button
            className="button secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(
                window.location.origin + path,
              );
              setCopied(true);
            }}
          >
            <Copy size={14} />
            {copied ? "Copied" : "Copy private link"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <form className="report-form" onSubmit={submit}>
      <label>
        What went wrong?
        <input
          name="title"
          placeholder="e.g. My cart total goes negative after a coupon"
          required
          minLength={5}
          maxLength={100}
          defaultValue={initialTitle}
          autoFocus
        />
      </label>
      <label>
        Walk us through it
        <textarea
          name="description"
          placeholder="What did you do? What happened? Include the steps someone else can follow."
          required
          minLength={8}
          maxLength={6000}
          rows={5}
          defaultValue={initialDescription}
        />
      </label>
      <div className="form-grid">
        <label>
          What should happen?
          <input
            name="expected"
            placeholder="The total should stop at zero"
            maxLength={300}
          />
        </label>
        <label>
          Device or browser <span className="optional">optional</span>
          <input
            name="environment"
            placeholder="Chrome, Android 15"
            maxLength={160}
          />
        </label>
      </div>
      <div className="privacy-note">
        <ShieldCheck size={17} />
        <span>
          Personal details are redacted before the report reaches engineering.
          Don’t include passwords, payment details, or private customer data.
        </span>
      </div>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      <button
        className="button primary submit-report"
        type="submit"
        disabled={busy}
      >
        {busy ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <ArrowUpRight size={16} />
        )}
        {busy
          ? "Sending your report…"
          : mode === "demo"
            ? "Submit demo report"
            : "Send bug report"}
      </button>
    </form>
  );
}
