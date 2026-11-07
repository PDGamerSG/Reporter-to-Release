import type { ReporterTriage } from "@/lib/presentation";
import styles from "./bug-desk.module.css";

const severityLabel = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};
const confidenceLabel = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

/** The AI triage result. Shared by the public page and the private tracker. */
export function FieldNotes({ triage }: { triage: ReporterTriage }) {
  const { inputTokens, cachedTokens } = triage.usage;
  return (
    <div className={styles.notes}>
      <p className={styles.reply}>{triage.reporterMessage}</p>
      <div className={styles.verdict}>
        <span className={`${styles.pill} ${styles[triage.severity]}`}>
          {severityLabel[triage.severity]} severity
        </span>
        <span className={styles.tag}>{triage.component}</span>
        <span className={styles.tag}>{confidenceLabel[triage.confidence]}</span>
      </div>
      <p className={styles.reason}>{triage.severityReason}</p>
      <div
        className={styles.deck}
        role="group"
        aria-label="Triage details"
        tabIndex={0}
      >
        <section className={styles.card}>
          <h3>Likely cause</h3>
          <p>{triage.likelyCause}</p>
        </section>
        <section className={styles.card}>
          <h3>Steps to reproduce</h3>
          <ol>
            {triage.reproductionSteps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </section>
        <section className={styles.card}>
          <h3>Test that proves it</h3>
          <p>{triage.regressionTest}</p>
        </section>
        {triage.missingInformation.length > 0 && (
          <section className={styles.card}>
            <h3>Still unknown</h3>
            <ul>
              {triage.missingInformation.map((question, index) => (
                <li key={index}>{question}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <p className={styles.fine}>
        AI suggestion from {triage.model}. A person decides severity and any
        fix.{" "}
        {cachedTokens > 0 &&
          `${cachedTokens.toLocaleString("en")} of ${inputTokens.toLocaleString("en")} prompt tokens came from cache.`}
      </p>
    </div>
  );
}
