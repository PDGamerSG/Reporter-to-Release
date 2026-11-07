"use client";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, RotateCcw } from "lucide-react";
import type { ReporterTriage } from "@/lib/presentation";
import styles from "./bug-desk.module.css";
import { FieldNotes } from "./field-notes";
import { Roly, SketchDefs } from "./roly";

type Phase = "idle" | "privacy" | "triage" | "done" | "held" | "saved";
interface Filed {
  reportId: string;
  clusterId: string;
  trackingToken: string;
  mode: "demo" | "live";
  quarantined: boolean;
  redacted: string[];
}

const MIN_LENGTH = 12;
const samples = [
  {
    label: "Coupon makes the total negative",
    text: "I added a 200 rupee item to my cart and applied the coupon SAVE300. The payable total now shows -100 instead of stopping at zero.",
  },
  {
    label: "Receipt preview stays blank",
    text: "After paying on Chrome for Android, the receipt preview is an empty white box. Refreshing the page does not bring it back.",
  },
  {
    label: "Cart empties on a quantity change",
    text: "When I change the quantity of an item on my phone, the whole cart empties and I have to add everything again.",
  },
];
const stops: { phase: Phase; label: string }[] = [
  { phase: "privacy", label: "Privacy check" },
  { phase: "triage", label: "AI triage" },
  { phase: "done", label: "Private link" },
];
const position: Record<Phase, number> = {
  idle: 0,
  privacy: 0.18,
  triage: 0.86,
  done: 1,
  held: 1,
  saved: 1,
};
const statusText: Record<Phase, string> = {
  idle: "",
  privacy: "Removing private details from your report.",
  triage: "Reading your report. This takes about 10 seconds.",
  done: "Your field notes are ready.",
  held: "Your report is held for a person to read.",
  saved: "Your report is saved. AI triage did not finish.",
};
const journey = [
  ["An engineer reads your notes", "Your report joins any matching bugs."],
  ["A failing test proves the bug", "You confirm it matches what you saw."],
  ["A person reviews the fix", "No fix ships on AI approval alone."],
  ["You check the live site", "If it still fails, the bug reopens."],
];

const noSubscribe = () => () => {};
/** False in the server HTML. A click before hydration would reload the page. */
const useHydrated = () =>
  useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

/** The server needs a short title, so it comes from the first sentence. */
function titleFrom(text: string) {
  const first = text.trim().split(/(?<=[.!?])\s|\n/)[0];
  if (first.length <= 100) return first;
  return `${first.slice(0, 97).replace(/\s+\S*$/, "")}...`;
}
async function send<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new Error("The connection dropped. Check it and try again.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error ?? "That did not go through. Try again.");
  return body;
}

export function BugDesk({
  demo = false,
  initialText = "",
}: {
  demo?: boolean;
  initialText?: string;
}) {
  const [text, setText] = useState(initialText);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [filed, setFiled] = useState<Filed>();
  const [triage, setTriage] = useState<ReporterTriage>();
  const [reused, setReused] = useState(false);
  const [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const hydrated = useHydrated();
  const busy = phase === "privacy" || phase === "triage";
  const finished = phase === "done" || phase === "held" || phase === "saved";
  const isSample = samples.some((sample) => sample.text === text.trim());

  useEffect(() => {
    if (finished) heading.current?.focus();
  }, [finished]);

  async function runTriage(report: Filed) {
    setPhase("triage");
    setError("");
    try {
      const result = await send<{ triage: ReporterTriage; reused: boolean }>(
        `/api/track/${report.reportId}/triage?mode=${report.mode}`,
        { headers: { "x-reporter-token": report.trackingToken } },
      );
      setTriage(result.triage);
      setReused(result.reused);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI triage did not finish.");
      setPhase("saved");
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    // Text typed before hydration is in the element but not yet in state.
    const description = (box.current?.value ?? text).trim();
    if (busy) return;
    if (description.length < MIN_LENGTH) {
      setError("Add a little more detail: what you did and what went wrong.");
      return;
    }
    setError("");
    setPhase("privacy");
    try {
      const report = await send<Filed>(
        demo || isSample ? "/api/reports?mode=demo" : "/api/intake",
        {
          body: JSON.stringify({ title: titleFrom(description), description }),
        },
      );
      setFiled(report);
      if (report.quarantined) setPhase("held");
      else await runTriage(report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through.");
      setPhase("idle");
    }
  }
  function reset() {
    setText("");
    setPhase("idle");
    setError("");
    setFiled(undefined);
    setTriage(undefined);
    setReused(false);
    setCopied(false);
  }
  const trackPath =
    filed &&
    `/track/${filed.reportId}?mode=${filed.mode}#${filed.trackingToken}`;
  const reached = stops.findIndex((stop) => stop.phase === phase);

  return (
    <div className={styles.page}>
      <SketchDefs />
      <header className={styles.top}>
        <Link href="/" className={styles.brand}>
          <Roly curled className={styles.brandMark} />
          Reporter-to-Release
        </Link>
        <Link href="/desk" className={styles.topLink}>
          Bug desk
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </header>
      <main id="main" className={styles.main}>
        <h1 className={styles.title}>Found a bug? Tell us what broke.</h1>
        <p className={styles.lead}>
          You get an instant AI read of the problem and a private link that
          follows it until the fix works for you.
        </p>
        <div className={styles.work}>
          <div className={styles.left}>
            <form onSubmit={submit} noValidate>
              <label className={styles.label} htmlFor="report">
                What happened?
              </label>
              <div className={styles.box}>
                <textarea
                  ref={box}
                  id="report"
                  value={text}
                  maxLength={6000}
                  rows={6}
                  disabled={busy || finished}
                  aria-invalid={Boolean(error) && phase === "idle"}
                  aria-describedby={error ? "report-error" : undefined}
                  placeholder="What you did, what you expected, and what went wrong."
                  onChange={(e) => {
                    setText(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                      void submit(e);
                  }}
                />
              </div>
              {error && phase === "idle" && (
                <p id="report-error" role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              <div className={styles.actions}>
                {finished ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={reset}
                  >
                    <RotateCcw size={17} aria-hidden="true" />
                    Report another bug
                  </button>
                ) : (
                  <button
                    type="submit"
                    className={styles.primary}
                    disabled={busy || !hydrated}
                  >
                    {busy ? "Working on it" : "Send report"}
                  </button>
                )}
                <span className={styles.hint}>
                  {isSample || demo
                    ? "Sample reports stay out of the live desk."
                    : "Private details are removed before anyone reads this."}
                </span>
              </div>
            </form>
            {!finished && !busy && (
              <div className={styles.samples}>
                <p id="samples-label">Or try a sample</p>
                <div
                  className={styles.sampleRow}
                  role="group"
                  aria-labelledby="samples-label"
                >
                  {samples.map((sample) => (
                    <button
                      key={sample.label}
                      type="button"
                      className={styles.sample}
                      aria-pressed={text === sample.text}
                      onClick={() => {
                        setText(sample.text);
                        setError("");
                      }}
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.track} data-busy={busy}>
              <div className={styles.rail}>
                <svg
                  viewBox="0 0 400 12"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M2 7C50 3 92 10 140 6s96-3 132 1 84 2 126-1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <div
                  className={styles.ball}
                  data-phase={phase}
                  style={{ ["--at" as string]: position[phase] }}
                >
                  <Roly
                    curled={phase !== "done" && phase !== "saved"}
                    worried={phase === "saved"}
                    className={busy ? styles.spin : undefined}
                  />
                </div>
              </div>
              <ol className={styles.stops}>
                {stops.map((stop, index) => {
                  const done = finished || index < reached;
                  return (
                    <li
                      key={stop.phase}
                      data-done={done}
                      aria-current={index === reached ? "step" : undefined}
                    >
                      {done && <Check size={14} aria-hidden="true" />}
                      {stop.label}
                    </li>
                  );
                })}
              </ol>
              <p role="status" className={styles.status}>
                {statusText[phase]}
              </p>
            </div>
          </div>
          <section className={styles.sheet} aria-label="Your result">
            {!filed && (
              <div className={styles.empty}>
                <Roly curled={false} className={styles.emptyBug} />
                <h2>Your field notes land here</h2>
                <p>
                  Severity, likely cause, steps to reproduce, and the test that
                  would prove it.
                </p>
              </div>
            )}
            {filed && phase === "triage" && (
              <div className={styles.empty}>
                <Roly curled className={`${styles.emptyBug} ${styles.spin}`} />
                <h2>Saved as {filed.clusterId}</h2>
                <p>Now writing your field notes.</p>
              </div>
            )}
            {filed && finished && (
              <>
                <p className={styles.bugId}>
                  {filed.clusterId}
                  {filed.mode === "demo" && " (sample)"}
                </p>
                <h2 ref={heading} tabIndex={-1} className={styles.summary}>
                  {phase === "held"
                    ? "A person will read this report first"
                    : phase === "saved"
                      ? "Your report is saved"
                      : triage?.summary}
                </h2>
                {phase === "held" && (
                  <p className={styles.note}>
                    It contains wording that reads like instructions to
                    software, so AI triage was skipped and the original text was
                    discarded. If it was a real bug, report it again using only
                    what you saw happen.
                  </p>
                )}
                {phase === "saved" && (
                  <div className={styles.retry}>
                    <p role="alert">{error}</p>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => void runTriage(filed)}
                    >
                      Try AI triage again
                    </button>
                  </div>
                )}
                {phase === "done" && reused && (
                  <p className={styles.note}>
                    This matches a bug we already know about, so you joined it.
                  </p>
                )}
                {triage && phase === "done" && <FieldNotes triage={triage} />}
                {filed.redacted.length > 0 && (
                  <p className={styles.note}>
                    Removed before storage: {filed.redacted.join(", ")}.
                  </p>
                )}
                <div className={styles.link}>
                  <div>
                    <h3>Keep your private link</h3>
                    <p>
                      You will use it to confirm the bug and the fix. Anyone
                      with it can act as you.
                    </p>
                  </div>
                  <div className={styles.linkActions}>
                    <a className={styles.secondary} href={trackPath}>
                      Open tracking page
                    </a>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          `${window.location.origin}${trackPath}`,
                        );
                        setCopied(true);
                      }}
                    >
                      <Copy size={15} aria-hidden="true" />
                      {copied ? "Copied" : "Copy link"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
        <section className={styles.after} aria-labelledby="after-title">
          <h2 id="after-title">What happens after you send it</h2>
          <ol className={styles.journey} tabIndex={0}>
            {journey.map(([title, body]) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <footer className={styles.foot}>
        Built by Team Vulcan on Switch.{" "}
        <Link href="/shoplite">Try the ShopLite sample store</Link>
      </footer>
    </div>
  );
}
