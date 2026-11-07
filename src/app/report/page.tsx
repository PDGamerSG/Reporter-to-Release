import { MessageCircle } from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { ReportForm } from "@/components/report-form";
export const metadata = { title: "Report a bug" };
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    title?: string;
    description?: string;
    mode?: string;
  }>;
}) {
  const params = await searchParams;
  const mode = params.mode === "demo" ? "demo" : "live";
  return (
    <div className="public-shell">
      <PublicHeader />
      <main id="main" className="public-content">
        <div className="public-intro">
          <span className="public-intro-icon">
            <MessageCircle size={24} />
          </span>
          <h1>
            You found a bug.
            <br />
            Let’s give it a better ending.
          </h1>
          <p>
            Tell us what happened. We’ll prove the problem, keep you in the
            loop, and ask you to confirm when the fix is live.
          </p>
        </div>
        <section className="public-card">
          <ReportForm
            mode={mode}
            initialTitle={params.title?.slice(0, 100)}
            initialDescription={params.description?.slice(0, 6000)}
          />
        </section>
        <p className="public-footer">
          {mode === "demo"
            ? "This is an isolated demonstration report. No external messages are sent."
            : "Reports enter the live bug desk. Keep the private tracking link you receive."}
          <br />
          Built by Team Vulcan on Switch.
        </p>
      </main>
    </div>
  );
}
