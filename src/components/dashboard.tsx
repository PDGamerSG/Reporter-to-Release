"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  ExternalLink,
  FlaskConical,
  GitBranch,
  GitPullRequest,
  Inbox,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MessageCircle,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import type { Command as WorkflowCommand, State } from "@/lib/domain/types";
import type { Workspace } from "@/lib/presentation";
import { ReportForm } from "./report-form";
import {
  Empty,
  External,
  Journey,
  Modal,
  SourceLabel,
  StateBadge,
  ago,
  niceDate,
} from "./ui";

type View =
  | "overview"
  | "inbox"
  | "activity"
  | "releases"
  | "crew"
  | "airlock"
  | "connections"
  | "guide";
const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "inbox", label: "Bug inbox", icon: Inbox },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "releases", label: "Releases", icon: Rocket },
  { id: "crew", label: "Agent crew", icon: Users },
  { id: "airlock", label: "Airlock", icon: ShieldCheck },
  { id: "connections", label: "Connections", icon: Workflow },
] as const;
const crew = [
  {
    name: "Concierge",
    vendor: "Python service",
    initials: "C",
    color: "teal",
    role: "Listens, sanitizes, keeps reporters informed",
    access: "Public room. No repository or shell access.",
  },
  {
    name: "Bug manager",
    vendor: "Python orchestration",
    initials: "M",
    color: "purple",
    role: "Groups reports and coordinates the handoffs",
    access: "Private engineering room. Sanitized dossiers only.",
  },
  {
    name: "Reproducer",
    vendor: "Example role",
    initials: "R",
    color: "amber",
    role: "Proves the bug with a failing test",
    access: "Test worktree. Cannot change application code.",
  },
  {
    name: "Fixer",
    vendor: "Example role",
    initials: "F",
    color: "blue",
    role: "Turns the confirmed regression green",
    access: "Per-bug worktree. Opens a draft PR; never merges.",
  },
  {
    name: "Reviewer",
    vendor: "Example role",
    initials: "R",
    color: "pink",
    role: "Checks the fix, evidence, and risk",
    access: "Read-only review. Human owners approve and merge.",
  },
];
const demoLabels: Partial<Record<State, string>> = {
  new: "Start example reproduction",
  reopened: "Retry example reproduction",
  reproducing: "Record example failing test",
  awaiting_reporter: "Simulate reporter confirmation",
  confirmed: "Start example fix",
  fixing: "Record example pull request",
  review: "Record example human review",
  merged: "Simulate production deployment",
  deployed: "Simulate reporter verification",
};
async function fetchWorkspace(): Promise<Workspace> {
  const response = await fetch("/api/workspace", { cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error);
  return value;
}

export function Dashboard() {
  const [data, setData] = useState<Workspace>();
  const engineeringVendor =
    data?.mode !== "live"
      ? "Example role"
      : data.engineering?.fresh
        ? `${data.engineering.provider === "meta" ? "Meta" : "Amazon Bedrock"} / ${data.engineering.model}`
        : "Waiting for engineering service";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("overview");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>();
  const [reportOpen, setReportOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [detailTab, setDetailTab] = useState("overview");
  const [actionForm, setActionForm] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try {
      setData(await fetchWorkspace());
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The workspace could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    fetchWorkspace()
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
  }, []);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function act(path: string, body: unknown, message: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      await load();
      setNotice(message);
      setActionForm(undefined);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: new FormData(event.currentTarget).get("token"),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setLoginOpen(false);
      setSelected(undefined);
      await load();
      setNotice("Live workspace opened.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }
  const clusters = data?.clusters ?? [];
  const current = clusters.find((c) => c.id === selected);
  const active = clusters.filter(
    (c) => !["verified", "quarantined"].includes(c.state),
  );
  const review = clusters.filter((c) =>
    ["review", "awaiting_reporter", "confirmed"].includes(c.state),
  );
  const released = clusters.filter((c) =>
    ["deployed", "verified"].includes(c.state),
  );
  const quarantined = clusters.filter((c) => c.state === "quarantined");
  const people = new Set(data?.reports.map((r) => r.alias)).size;
  const visible = (view === "airlock" ? quarantined : clusters).filter(
    (c) =>
      (!search ||
        `${c.id} ${c.title} ${c.component}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (filter === "all" ||
        (filter === "review" && review.includes(c)) ||
        (filter === "progress" &&
          ["reproducing", "confirmed", "fixing", "merged"].includes(c.state)) ||
        (filter === "released" && released.includes(c)) ||
        (filter === "quarantined" && c.state === "quarantined")),
  );
  const eventList = [...(data?.events ?? [])].reverse();
  const changeView = (value: View) => {
    setView(value);
    setFilter("all");
    setSearch("");
    setMobileOpen(false);
  };
  const openBug = (id: string) => {
    setSelected(id);
    setDetailTab("overview");
  };

  function bugQueue() {
    return (
      <section className="queue-section">
        <div className="section-heading">
          <div>
            <h2>
              {view === "airlock"
                ? "Reports held for review"
                : view === "inbox"
                  ? "All bug reports"
                  : "Bug inbox"}
              <span className="count-pill">
                {view === "airlock" ? quarantined.length : clusters.length}
              </span>
            </h2>
            <p>
              {view === "airlock"
                ? "Instruction-bearing text is discarded before it reaches engineering."
                : "Real people. Reproducible bugs. A clear path forward."}
            </p>
          </div>
          <button
            className="button subtle small"
            onClick={() => {
              setView("inbox");
              setFilter("all");
            }}
          >
            View all
            <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="queue-tools">
          <div className="tabs" aria-label="Filter bugs">
            {[
              ["all", "All reports"],
              ["review", "Needs attention"],
              ["progress", "In progress"],
              ["released", "Released"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={filter === id ? "active" : ""}
                onClick={() => setFilter(id)}
              >
                {label}
                {id === "review" && review.length > 0 && (
                  <span>{review.length}</span>
                )}
              </button>
            ))}
          </div>
          <label className="search-input">
            <Search size={15} />
            <input
              ref={searchRef}
              aria-label="Search bug reports"
              placeholder="Search reports…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>⌘ K</kbd>
          </label>
        </div>
        <div className="bug-table">
          <div className="table-head">
            <span>Report</span>
            <span>Status</span>
            <span>Impact</span>
            <span>Updated</span>
            <span />
          </div>
          {visible.map((c) => (
            <button
              className="bug-row"
              key={c.id}
              onClick={() => openBug(c.id)}
            >
              <div className="bug-main">
                <span
                  className={`severity-mark severity-${c.severity}`}
                  title={`${c.severity} severity`}
                />
                <div>
                  <div className="bug-title">
                    <span className="bug-id">{c.id}</span>
                    <strong>{c.title}</strong>
                  </div>
                  <div className="bug-meta">
                    <span className="component-tag">{c.component}</span>
                    <span>
                      {[
                        ...new Set(
                          data?.reports
                            .filter((r) => r.clusterId === c.id)
                            .map((r) => r.source),
                        ),
                      ]
                        .slice(0, 2)
                        .map((source) => (
                          <SourceLabel key={source} source={source} />
                        ))}
                    </span>
                    {c.fix && (
                      <span className="pr-hint">
                        <GitPullRequest size={12} />#{c.fix.prNumber}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <StateBadge state={c.state} />
              <span className="impact">
                <Users size={13} />
                {c.reportIds.length}
                <span>reporters</span>
              </span>
              <span className="updated">{ago(c.updatedAt)}</span>
              <ChevronRight size={15} className="row-chevron" />
            </button>
          ))}
          {visible.length === 0 && (
            <Empty
              title={search ? "No matching reports" : "Nothing in this queue"}
            >
              {search
                ? "Try another search or clear the filter."
                : "New reports will appear here as they arrive."}
            </Empty>
          )}
        </div>
        <div className="queue-footer">
          <span>
            Showing {visible.length} of{" "}
            {view === "airlock" ? quarantined.length : clusters.length} reports
          </span>
          <span>
            <Shield size={12} />
            Every fix starts with proof
          </span>
        </div>
      </section>
    );
  }

  function activityFeed(limit = 8) {
    return (
      <div className="activity-list">
        {eventList.slice(0, limit).map((e) => (
          <button
            key={e.id}
            className="activity-item"
            onClick={() => openBug(e.clusterId)}
          >
            <span
              className={`activity-dot ${e.kind.includes("deploy") || e.kind.includes("verify") ? "green" : e.kind.includes("fix") ? "purple" : ""}`}
            />{" "}
            <span>
              <strong>{e.title}</strong>
              <span className="activity-description">
                {e.clusterId}
                <span>·</span>
                {e.actor}
              </span>
            </span>
            <time>{ago(e.at)}</time>
          </button>
        ))}
        {!eventList.length && (
          <Empty title="The trail starts here">
            Reports and workflow decisions will appear in this log.
          </Empty>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <Link className="brand" href="/">
          <span className="brand-mark">
            <GitBranch size={21} />
          </span>
          <span>
            Reporter<span className="brand-second">to Release</span>
          </span>
          <span className="brand-dot" />
        </Link>
        <button className="workspace-switch" onClick={() => setLoginOpen(true)}>
          <span className="team-avatar">V</span>
          <span>
            <strong>Team Vulcan</strong>
            <small>
              {data?.mode === "live" ? "Live workspace" : "Hackathon workspace"}
            </small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="sidebar-label">Workspace</div>
        <nav>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => changeView(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "inbox" && (
                <span className="nav-count">{clusters.length || "—"}</span>
              )}
              {id === "airlock" && quarantined.length > 0 && (
                <span className="nav-alert">{quarantined.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="powered-card">
            <span className="powered-symbol">
              <Zap size={17} />
            </span>
            <div>
              <strong>Built on Switch</strong>
              <p>One crew. Every handoff.</p>
            </div>
            <a
              href="https://github.com/sandbox-quantum/switch"
              target="_blank"
              rel="noreferrer"
              aria-label="Switch on GitHub"
            >
              <ArrowUpRight size={15} />
            </a>
          </div>
          <button
            className={`nav-item ${view === "guide" ? "active" : ""}`}
            onClick={() => changeView("guide")}
          >
            <BookOpen size={17} />
            <span>Workflow guide</span>
          </button>
          <a className="nav-item" href="/shoplite">
            <FlaskConical size={17} />
            <span>ShopLite test app</span>
            <ArrowUpRight size={13} />
          </a>
          <div className="sidebar-account">
            <span className="avatar-stack">
              <span>AA</span>
              <span>PD</span>
              <span>+2</span>
            </span>
            <div>
              <strong>Team Vulcan</strong>
              <small>Flip the Switch 2026</small>
            </div>
            <button
              className="icon-button"
              aria-label="Workspace access"
              onClick={() => setLoginOpen(true)}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {navigation.find((n) => n.id === view)?.label ?? "Workflow guide"}
            </strong>
          </div>
          <div className="topbar-actions">
            <span
              className={`mode-badge ${data?.mode === "live" ? "live" : ""}`}
            >
              <span />
              {data?.mode === "live" ? "Live workspace" : "Interactive demo"}
            </span>
            <button
              className="icon-button refresh"
              onClick={load}
              aria-label="Refresh workspace"
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="icon-button notification-button"
              aria-label="View recent activity"
              onClick={() => changeView("activity")}
            >
              <Bell size={18} />
              <span />
            </button>
            <span className="topbar-avatar">V</span>
          </div>
        </header>
        <main id="main" className="workspace-main">
          <div className="page-heading">
            <div>
              <div className="date-line">
                <span className="little-orbit" />
                {new Date().toLocaleDateString("en", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </div>
              <h1>
                {view === "overview"
                  ? "Good reports. Better resolutions."
                  : view === "inbox"
                    ? "Every bug, in one place."
                    : view === "activity"
                      ? "Nothing lost between handoffs."
                      : view === "releases"
                        ? "Shipped is only the beginning."
                        : view === "crew"
                          ? "Different agents. One shared mission."
                          : view === "airlock"
                            ? "A safe way into engineering."
                            : view === "connections"
                              ? "Connect the whole journey."
                              : "From “it’s broken” to “it works.”"}
              </h1>
              <p>
                {view === "overview"
                  ? "Follow every bug from the first message to a fix the reporter confirms."
                  : view === "crew"
                    ? "Clear responsibilities, separate permissions, and a human at the merge button."
                    : "The evidence and the people stay connected at every step."}
              </p>
            </div>
            <div className="heading-actions">
              <a className="button secondary" href="/api/export" download>
                <ArrowDownToLine size={15} />
                <span>Export log</span>
              </a>
              <button
                className="button primary"
                onClick={() => setReportOpen(true)}
              >
                <Plus size={17} />
                New report
              </button>
            </div>
          </div>
          {data?.mode === "demo" && (
            <div className="demo-banner">
              <FlaskConical size={16} />
              <span>
                You’re exploring a private demo. Example agents, reports, and
                releases are simulated.
              </span>
              <button onClick={() => setLoginOpen(true)}>
                Open live workspace
                <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {error && (
            <div className="error-message workspace-error" role="alert">
              <span>{error}</span>
              <button className="text-link" onClick={load}>
                Retry
              </button>
            </div>
          )}
          {loading && !data ? (
            <div className="loading-workspace">
              <LoaderCircle className="spin" size={28} />
              <h2>Opening your bug desk…</h2>
              <p>Connecting reports, evidence, and release history.</p>
            </div>
          ) : (
            data && (
              <>
                {(view === "overview" || view === "inbox") && (
                  <>
                    <div className="stats-grid">
                      <div className="stat-item">
                        <span className="stat-icon purple">
                          <Inbox size={20} />
                        </span>
                        <div>
                          <span>Active bugs</span>
                          <strong>
                            {active.length}
                            <small>
                              across{" "}
                              {new Set(active.map((c) => c.component)).size}{" "}
                              areas
                            </small>
                          </strong>
                        </div>
                        <span className="mini-bars">
                          <i />
                          <i />
                          <i />
                          <i />
                          <i />
                          <i />
                          <i />
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-icon amber">
                          <Users size={20} />
                        </span>
                        <div>
                          <span>People heard</span>
                          <strong>
                            {people}
                            <small>no report left behind</small>
                          </strong>
                        </div>
                        <span className="stat-annotation">
                          {Math.max(0, people - clusters.length)}
                          <small>duplicates linked</small>
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-icon teal">
                          <ShieldCheck size={20} />
                        </span>
                        <div>
                          <span>Verified resolutions</span>
                          <strong>
                            {
                              clusters.filter((c) => c.state === "verified")
                                .length
                            }
                            <small>confirmed by the reporter</small>
                          </strong>
                        </div>
                        <span className="stat-check">
                          <Check size={18} />
                        </span>
                      </div>
                    </div>
                    {view === "overview" && (
                      <section className="pipeline-strip">
                        <div className="pipeline-intro">
                          <span className="pipeline-icon">
                            <Workflow size={20} />
                          </span>
                          <div>
                            <strong>The resolution loop</strong>
                            <small>
                              Proof before patches. People before closure.
                            </small>
                          </div>
                        </div>
                        <div className="pipeline-track">
                          {[
                            {
                              name: "Intake",
                              count: clusters.filter((c) => c.state === "new")
                                .length,
                              color: "blue",
                            },
                            {
                              name: "Reproduce",
                              count: clusters.filter((c) =>
                                ["reproducing", "reopened"].includes(c.state),
                              ).length,
                              color: "amber",
                            },
                            {
                              name: "Confirm",
                              count: clusters.filter((c) =>
                                ["awaiting_reporter", "confirmed"].includes(
                                  c.state,
                                ),
                              ).length,
                              color: "purple",
                            },
                            {
                              name: "Fix & review",
                              count: clusters.filter((c) =>
                                ["fixing", "review", "merged"].includes(
                                  c.state,
                                ),
                              ).length,
                              color: "pink",
                            },
                            {
                              name: "Release",
                              count: released.length,
                              color: "teal",
                            },
                          ].map((stage, i) => (
                            <div className="pipeline-stage" key={stage.name}>
                              <span
                                className={`pipeline-stage-number ${stage.color}`}
                              >
                                {stage.count}
                              </span>
                              <span>{stage.name}</span>
                              {i < 4 && <ChevronRight size={13} />}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                    <div
                      className={`content-grid ${view === "inbox" ? "full-width" : ""}`}
                    >
                      <div>
                        {bugQueue()}
                        {view === "overview" && (
                          <div className="loop-callout">
                            <span className="callout-icon">
                              <MessageCircle size={22} />
                            </span>
                            <div>
                              <strong>A merge isn’t the finish line.</strong>
                              <p>
                                When the fix goes live, every reporter gets an
                                update. If it still fails, the bug reopens.
                              </p>
                            </div>
                            <button
                              className="text-link"
                              onClick={() => changeView("guide")}
                            >
                              See the workflow
                              <ArrowRight size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                      {view === "overview" && (
                        <aside className="context-rail">
                          <section className="rail-card">
                            <div className="rail-heading">
                              <h2>
                                <Activity size={16} />
                                Latest activity
                              </h2>
                              <button
                                className="icon-button"
                                aria-label="View all activity"
                                onClick={() => changeView("activity")}
                              >
                                <ArrowUpRight size={15} />
                              </button>
                            </div>
                            {activityFeed(5)}
                            <button
                              className="rail-footer-button"
                              onClick={() => changeView("activity")}
                            >
                              Open activity log
                              <ArrowRight size={13} />
                            </button>
                          </section>
                          <section className="rail-card crew-preview">
                            <div className="rail-heading">
                              <h2>
                                <Users size={16} />
                                The crew
                              </h2>
                              <span className="small-muted">5 roles</span>
                            </div>
                            {crew.slice(0, 4).map((a) => (
                              <div className="crew-mini" key={a.name}>
                                <span className={`agent-avatar ${a.color}`}>
                                  {a.initials}
                                </span>
                                <div>
                                  <strong>{a.name}</strong>
                                  <small>{a.vendor.split(" / ")[0]}</small>
                                </div>
                                <span className="role-indicator" />
                              </div>
                            ))}
                            <button
                              className="rail-footer-button"
                              onClick={() => changeView("crew")}
                            >
                              Meet the whole crew
                              <ArrowRight size={13} />
                            </button>
                          </section>
                        </aside>
                      )}
                    </div>
                  </>
                )}
                {view === "activity" && (
                  <section className="panel activity-panel">
                    <div className="section-heading">
                      <div>
                        <h2>The complete evidence trail</h2>
                        <p>Each transition records who did what and why.</p>
                      </div>
                      <span className="count-pill">
                        {eventList.length} events
                      </span>
                    </div>
                    {activityFeed(200)}
                  </section>
                )}
                {view === "releases" && (
                  <div className="release-grid">
                    {released.map((c) => (
                      <section className="release-card" key={c.id}>
                        <div className="release-card-top">
                          <span className="stat-icon teal">
                            <Rocket size={22} />
                          </span>
                          <StateBadge state={c.state} />
                        </div>
                        <span className="small-muted">
                          {c.id} · {c.release?.version}
                        </span>
                        <h2>{c.title}</h2>
                        <p>
                          {c.reportIds.length} affected reporters.{" "}
                          {
                            data.reports.filter(
                              (r) => r.clusterId === c.id && r.releaseConfirmed,
                            ).length
                          }{" "}
                          confirmed the live fix.
                        </p>
                        <div className="release-footer">
                          <span>
                            <CheckCircle2 size={14} />
                            {c.release ? niceDate(c.release.deployedAt) : ""}
                          </span>
                          <button
                            className="text-link"
                            onClick={() => openBug(c.id)}
                          >
                            View evidence
                            <ArrowUpRight size={13} />
                          </button>
                        </div>
                      </section>
                    ))}
                    {!released.length && (
                      <Empty title="No releases yet">
                        A verified production deployment will appear here after
                        a human merges the reviewed fix.
                      </Empty>
                    )}
                  </div>
                )}
                {view === "crew" && (
                  <>
                    <div className="info-banner">
                      <LockKeyhole size={18} />
                      <span>
                        These are the workflow’s configured roles.{" "}
                        {data.mode === "demo"
                          ? "Example activity is simulated."
                          : data.engineering?.fresh
                            ? `${data.engineering.roomsConnected} of 4 engineering role connections. Model outcomes are recorded in each bug’s activity.`
                            : "Waiting for a fresh engineering heartbeat from AWS. Model outcomes are recorded in each bug’s activity."}
                      </span>
                    </div>
                    <div className="crew-grid">
                      {crew.map((a) => (
                        <section className="agent-card" key={a.name}>
                          <div>
                            <span className={`agent-avatar large ${a.color}`}>
                              {a.initials}
                            </span>
                            <span className="role-badge">
                              {a.name === "Concierge"
                                ? "Public-facing"
                                : "Private engineering"}
                            </span>
                          </div>
                          <h2>{a.name}</h2>
                          <span className="vendor-label">
                            {a.name === "Concierge" || a.name === "Bug manager"
                              ? a.vendor
                              : engineeringVendor}
                          </span>
                          <p>{a.role}</p>
                          <div className="agent-access">
                            <Shield size={14} />
                            {a.access}
                          </div>
                        </section>
                      ))}
                    </div>
                    <div className="human-gate">
                      <span className="human-icon">
                        <Users size={24} />
                      </span>
                      <div>
                        <h3>The most important role is still human.</h3>
                        <p>
                          Owners approve the evidence and merge the pull
                          request. Sensitive changes need two humans, including
                          a code owner.
                        </p>
                      </div>
                    </div>
                  </>
                )}
                {view === "airlock" && (
                  <>
                    <div className="airlock-explainer">
                      <span className="airlock-shield">
                        <ShieldCheck size={34} />
                      </span>
                      <div>
                        <h2>
                          Bug facts cross the boundary. Instructions don’t.
                        </h2>
                        <p>
                          Incoming reports are normalized, stripped of links and
                          mentions, checked for instruction signals, and
                          redacted. Suspicious text is discarded. An owner must
                          supply clean replacement facts.
                        </p>
                      </div>
                      <span className="airlock-counter">
                        <strong>{quarantined.length}</strong>held for review
                      </span>
                    </div>
                    {bugQueue()}
                  </>
                )}
                {view === "connections" && (
                  <>
                    <div className="connection-grid">
                      {data.integrations.map((i) => (
                        <section className="connection-card" key={i.id}>
                          <div className="connection-card-top">
                            <span className={`connection-logo ${i.id}`}>
                              {i.id === "database" ? (
                                <GitBranch />
                              ) : i.id === "switch" ? (
                                <Zap />
                              ) : i.id === "github" ? (
                                <GitPullRequest />
                              ) : i.id === "engineering" || i.id === "model" ? (
                                <Cpu />
                              ) : (
                                <MessageCircle />
                              )}
                            </span>
                            <span className={`connection-status ${i.status}`}>
                              <span />
                              {i.status}
                            </span>
                          </div>
                          <h2>{i.name}</h2>
                          <p>{i.detail}</p>
                          <div className="connection-next">
                            {i.id === "database"
                              ? "Reports persist across deployments."
                              : i.id === "switch"
                                ? "AWS hosts the persistent room worker."
                                : i.id === "github"
                                  ? "Only signed events from the connected repository are accepted."
                                  : i.id === "engineering"
                                    ? "AWS coordinates measured regressions and draft fixes."
                                    : i.id === "model"
                                      ? "Advisory triage uses a server-side spending cap."
                                      : "Chat is optional; web reports are available now."}
                          </div>
                        </section>
                      ))}
                    </div>
                    <section className="panel setup-panel">
                      <h2>One flow, connected deliberately.</h2>
                      <p>
                        The live connection status reflects configuration and
                        worker heartbeats. The demo is isolated from these
                        services.
                      </p>
                      <ol>
                        <li>Send a web report from the home page.</li>
                        <li>
                          Confirm the AWS reproducer’s failing test using your
                          private tracking link.
                        </li>
                        <li>
                          Review the tested draft fix. A human owner approves
                          and merges it.
                        </li>
                        <li>
                          After the verified production deployment, check the
                          fix and confirm it or reopen the report.
                        </li>
                      </ol>
                      <External href="https://github.com/PDGamerSG/Reporter-to-Release#quick-start">
                        Setup and source
                      </External>
                    </section>
                  </>
                )}
                {view === "guide" && (
                  <section className="workflow-guide panel">
                    <div className="guide-intro">
                      <span className="stat-icon purple">
                        <Workflow size={24} />
                      </span>
                      <h2>Close the loop, not just the ticket.</h2>
                      <p>
                        A report is a conversation with someone who needs their
                        problem solved. Here’s how the desk keeps that person
                        connected.
                      </p>
                    </div>
                    {[
                      {
                        title: "A person reports what broke",
                        description:
                          "They use the public bug desk or the web form. The concierge keeps the steps and observed behavior; common personal details are redacted.",
                        icon: MessageCircle,
                      },
                      {
                        title: "The bug earns its evidence",
                        description:
                          "The reproducer writes and runs a failing regression. The original reporter gets the reproduction and confirms it using a private link or native card.",
                        icon: FlaskConical,
                      },
                      {
                        title: "A separate agent writes the fix",
                        description:
                          "The fixer receives the confirmed test and sanitized dossier. A reviewer checks the patch. A human owner approves and merges it.",
                        icon: GitPullRequest,
                      },
                      {
                        title: "Production makes it real",
                        description:
                          "The signed GitHub relay verifies that the production commit contains the merge. A merge alone never sends a release notice.",
                        icon: Rocket,
                      },
                      {
                        title: "Every reporter gets the last word",
                        description:
                          "Everyone in the cluster gets a notification. The reporter confirms the fix. If it still fails, the bug reopens and a new reproduction is required.",
                        icon: ShieldCheck,
                      },
                    ].map((s, i) => (
                      <div className="guide-step" key={s.title}>
                        <span className="guide-step-number">{i + 1}</span>
                        <div>
                          <h3>
                            <s.icon size={18} />
                            {s.title}
                          </h3>
                          <p>{s.description}</p>
                        </div>
                      </div>
                    ))}
                    <div className="guide-actions">
                      <Link className="button primary" href="/">
                        Report a real bug
                        <ArrowUpRight size={15} />
                      </Link>
                      <Link className="button secondary" href="/shoplite">
                        Try the seeded bug
                        <FlaskConical size={15} />
                      </Link>
                    </div>
                  </section>
                )}
              </>
            )
          )}
          <footer className="app-footer">
            <span>
              <span className="footer-dot" />
              Reporter-to-Release <span className="footer-slash">/</span> Team
              Vulcan
            </span>
            <span>
              Proof. People. Production.
              <a
                href="https://github.com/PDGamerSG/Reporter-to-Release"
                target="_blank"
                rel="noreferrer"
              >
                View source
                <ArrowUpRight size={12} />
              </a>
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {reportOpen && (
        <Modal
          title="Let’s get this bug heard."
          subtitle={
            data?.mode === "demo"
              ? "This report stays in your private demonstration workspace."
              : "New reports enter the live bug desk through the privacy airlock."
          }
          onClose={() => setReportOpen(false)}
        >
          <ReportForm
            mode={data?.mode ?? "demo"}
            onCreated={() => {
              void load();
            }}
          />
        </Modal>
      )}
      {loginOpen && (
        <Modal
          title={
            data?.mode === "live"
              ? "Live workspace access"
              : "Open your live workspace"
          }
          subtitle="Owner access is separate from the public demonstration."
          onClose={() => setLoginOpen(false)}
        >
          {data?.mode === "live" ? (
            <div className="modal-body">
              <p>You are signed in as the workspace owner.</p>
              <button
                className="button secondary"
                onClick={async () => {
                  await fetch("/api/auth", { method: "DELETE" });
                  setLoginOpen(false);
                  setSelected(undefined);
                  await load();
                }}
              >
                Return to the demo
              </button>
            </div>
          ) : (
            <form className="report-form" onSubmit={login}>
              <label>
                Owner access key
                <input
                  name="token"
                  type="password"
                  placeholder="Enter the private owner key"
                  required
                  autoComplete="current-password"
                />
              </label>
              <p className="small-muted">
                The owner key is the ADMIN_TOKEN configured by your team. Public
                reporters can use their private tracking links without signing
                in.
              </p>
              {error && (
                <div className="error-message" role="alert">
                  {error}
                </div>
              )}
              <button className="button primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <LockKeyhole size={15} />
                )}
                Open live workspace
              </button>
              <Link className="text-link" href="/">
                I want to report a bug
                <ArrowUpRight size={13} />
              </Link>
            </form>
          )}
        </Modal>
      )}
      {current && data && (
        <Modal
          wide
          title={current.id}
          subtitle={
            data.mode === "demo"
              ? "Demonstration report · no external actions are performed"
              : "Live bug dossier and evidence trail"
          }
          onClose={() => {
            setSelected(undefined);
            setActionForm(undefined);
          }}
        >
          <div className="bug-detail">
            <div className="detail-title-row">
              <h2>{current.title}</h2>
              <StateBadge state={current.state} />
            </div>
            <div className="detail-meta">
              <span className={`severity-label severity-${current.severity}`}>
                {current.severity} priority
              </span>
              <span>{current.component}</span>
              <span>
                <Users size={13} />
                {current.reportIds.length} affected reporters
              </span>
            </div>
            <Journey cluster={current} />
            <div className="detail-tabs tabs">
              {["overview", "evidence", "activity", "reporters"].map((t) => (
                <button
                  key={t}
                  className={detailTab === t ? "active" : ""}
                  onClick={() => setDetailTab(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            {detailTab === "overview" && (
              <div className="detail-overview">
                <div className="dossier-grid">
                  <section>
                    <h3>What happened</h3>
                    <p>{current.dossier.actual}</p>
                  </section>
                  <section>
                    <h3>What should happen</h3>
                    <p>{current.dossier.expected}</p>
                  </section>
                </div>
                {current.triage && (
                  <section className="steps-block">
                    <h3>AI triage (advisory)</h3>
                    <p>{current.triage.summary}</p>
                    <p>
                      Suggested severity: {current.triage.severity}.{" "}
                      {current.triage.severityReason}
                    </p>
                    <p>{current.triage.likelyCause}</p>
                    <p>Test idea: {current.triage.regressionTest}</p>
                  </section>
                )}
                <section className="steps-block">
                  <h3>Steps to reproduce</h3>
                  <ol>
                    {current.dossier.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  {!current.dossier.steps.length && (
                    <p>
                      Original content was discarded by the airlock. An owner
                      must provide clean facts.
                    </p>
                  )}
                </section>
                <div className="detail-information">
                  <span>
                    <strong>Environment</strong>
                    {current.dossier.environment}
                  </span>
                  <span>
                    <strong>Assigned to</strong>
                    {current.assignee}
                  </span>
                  <span>
                    <strong>Received</strong>
                    {niceDate(current.createdAt)}
                  </span>
                </div>
                <div className="sanitized-note">
                  <ShieldCheck size={16} />
                  <span>
                    {current.dossier.safety.quarantined
                      ? `Held by the airlock: ${current.dossier.safety.signals.join(", ")}.`
                      : `Sanitized dossier. ${current.dossier.safety.piiRedacted.length ? `Redacted: ${current.dossier.safety.piiRedacted.join(", ")}.` : "No common personal data patterns detected."} Raw report text is not retained.`}
                  </span>
                </div>
              </div>
            )}
            {detailTab === "evidence" && (
              <div className="evidence-content">
                {current.reproduction ? (
                  <>
                    <div className="evidence-label">
                      <span className="evidence-dot red" />
                      Failing reproduction
                      <span className="small-muted">
                        {current.reproduction.testPath}
                      </span>
                    </div>
                    <p>{current.reproduction.summary}</p>
                    <pre className="code-block">
                      <span>$ {current.reproduction.testCommand}</span>
                      {"\n\n"}
                      {current.reproduction.testOutput}
                    </pre>
                    {current.reproduction.screenshotUrl && (
                      <a
                        className="text-link"
                        href={current.reproduction.screenshotUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View reproduction image
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </>
                ) : (
                  <Empty title="Proof comes before a patch">
                    The reproducer will record the failing test and observed
                    behavior here.
                  </Empty>
                )}
                {current.fix && (
                  <>
                    <div className="evidence-label">
                      <span className="evidence-dot green" />
                      Fix and review
                      <span className="risk-badge">
                        Risk tier {current.fix.risk}
                      </span>
                    </div>
                    <p>{current.fix.summary}</p>
                    <pre className="code-block success-code">
                      {current.fix.testOutput}
                    </pre>
                    <div className="review-summary">
                      <GitPullRequest size={16} />
                      <span>
                        {data.mode === "demo" ? (
                          `Example pull request #${current.fix.prNumber}`
                        ) : (
                          <External href={current.fix.prUrl}>
                            Pull request #{current.fix.prNumber}
                          </External>
                        )}
                      </span>
                      <span>
                        {current.fix.approvals.length} human approval
                        {current.fix.approvals.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </>
                )}
                {current.release && (
                  <div className="release-evidence">
                    <Rocket size={20} />
                    <div>
                      <strong>{current.release.version} is live</strong>
                      <p>Production commit {current.release.sha.slice(0, 7)}</p>
                    </div>
                    {data.mode === "demo" ? (
                      <span className="role-badge">Simulated deployment</span>
                    ) : (
                      <External href={current.release.url}>
                        Open release
                      </External>
                    )}
                  </div>
                )}
              </div>
            )}
            {detailTab === "activity" && (
              <div className="detail-activity">
                {eventList
                  .filter((e) => e.clusterId === current.id)
                  .map((e) => (
                    <div className="timeline-event" key={e.id}>
                      <span className="timeline-marker" />
                      <div>
                        <strong>{e.title}</strong>
                        <p>{e.body}</p>
                        <small>
                          {e.actor} · {niceDate(e.at)}
                        </small>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            {detailTab === "reporters" && (
              <div className="reporter-list">
                <div className="privacy-note">
                  <LockKeyhole size={15} />
                  Reporter routing and private tracking tokens are never exposed
                  here.
                </div>
                {data.reports
                  .filter((r) => r.clusterId === current.id)
                  .map((r, i) => (
                    <div className="reporter-row" key={r.id}>
                      <span className={`reporter-avatar tone-${i % 4}`}>
                        {r.alias.split(" ").at(-1)}
                      </span>
                      <div>
                        <strong>{r.alias}</strong>
                        <small>Joined {ago(r.createdAt)}</small>
                      </div>
                      <SourceLabel source={r.source} />
                      <span className="reporter-confirmation">
                        {r.releaseConfirmed ? (
                          <>
                            <CheckCircle2 size={13} />
                            Fix verified
                          </>
                        ) : r.reproductionConfirmed ? (
                          <>
                            <Check size={13} />
                            Repro confirmed
                          </>
                        ) : (
                          "Following this bug"
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
            {actionForm && (
              <ActionForm
                type={actionForm}
                busy={busy}
                onCancel={() => setActionForm(undefined)}
                onSubmit={(command) =>
                  act(
                    `/api/bugs/${current.id}/actions`,
                    command,
                    "Evidence recorded.",
                  )
                }
              />
            )}
            <div className="detail-action-bar">
              <span>
                <LockKeyhole size={13} />
                {data.mode === "demo"
                  ? "Sandbox actions only"
                  : "Human merge required"}
              </span>
              <div>
                {data.mode === "demo" &&
                  current.state !== "verified" &&
                  current.state !== "quarantined" && (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        act(
                          `/api/bugs/${current.id}/demo-step`,
                          {},
                          "Example workflow advanced. No external systems were changed.",
                        )
                      }
                    >
                      {busy ? (
                        <LoaderCircle size={15} className="spin" />
                      ) : (
                        <ArrowRight size={15} />
                      )}
                      {current.state === "review" &&
                      current.fix?.approvals.length
                        ? "Simulate human merge"
                        : demoLabels[current.state]}
                    </button>
                  )}
                {data.mode === "live" && !actionForm && (
                  <>
                    {["new", "reopened"].includes(current.state) && (
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          act(
                            `/api/bugs/${current.id}/actions`,
                            { type: "start_reproduction" },
                            "Reproduction started.",
                          )
                        }
                      >
                        Start reproduction
                      </button>
                    )}
                    {current.state === "reproducing" && (
                      <button
                        className="button primary"
                        onClick={() => setActionForm("propose_reproduction")}
                      >
                        Record failing reproduction
                      </button>
                    )}
                    {current.state === "confirmed" && (
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          act(
                            `/api/bugs/${current.id}/actions`,
                            { type: "start_fix" },
                            "Fixing started.",
                          )
                        }
                      >
                        Start the fix
                      </button>
                    )}
                    {current.state === "fixing" && (
                      <button
                        className="button primary"
                        onClick={() => setActionForm("submit_fix")}
                      >
                        Record fix pull request
                      </button>
                    )}
                    {current.state === "review" && current.fix?.risk === 2 && (
                      <External href={current.fix.prUrl}>
                        Two human GitHub reviews required
                      </External>
                    )}
                    {current.state === "review" && current.fix?.risk !== 2 && (
                      <button
                        className="button primary"
                        onClick={() => setActionForm("approve_fix")}
                      >
                        Record human review
                      </button>
                    )}
                    {current.state === "quarantined" && (
                      <button
                        className="button primary"
                        onClick={() => setActionForm("release_quarantine")}
                      >
                        Supply clean facts
                      </button>
                    )}
                    {[
                      "merged",
                      "deployed",
                      "verified",
                      "awaiting_reporter",
                    ].includes(current.state) && (
                      <span className="small-muted">
                        {current.state === "merged"
                          ? "Waiting for a signed production deployment"
                          : current.state === "verified"
                            ? "The reporter confirmed the fix"
                            : "Waiting for the original reporter"}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ActionForm({
  type,
  busy,
  onSubmit,
  onCancel,
}: {
  type: string;
  busy: boolean;
  onSubmit: (command: WorkflowCommand) => void;
  onCancel: () => void;
}) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const value: Record<string, unknown> = { ...data, type };
    if (type === "propose_reproduction")
      value.steps = String(data.steps).split("\n").filter(Boolean);
    if (type === "submit_fix") {
      value.prNumber = Number(data.prNumber);
      value.changedFiles = String(data.changedFiles)
        .split("\n")
        .filter(Boolean);
    }
    onSubmit(value as WorkflowCommand);
  }
  const fields =
    type === "propose_reproduction"
      ? [
          ["summary", "What the reproduction proves", "input"],
          ["steps", "Exact steps, one per line", "textarea"],
          ["testCommand", "Command actually run", "input"],
          ["testPath", "Regression test path", "input"],
          ["testOutput", "Actual failing output", "textarea"],
        ]
      : type === "submit_fix"
        ? [
            ["prUrl", "GitHub pull request URL", "input"],
            ["prNumber", "Pull request number", "number"],
            ["headSha", "Full 40-character head SHA", "input"],
            ["changedFiles", "Changed files, one per line", "textarea"],
            ["summary", "What the patch changes", "input"],
            ["testOutput", "Actual passing output", "textarea"],
          ]
        : type === "release_quarantine"
          ? [
              ["title", "Clean bug title", "input"],
              [
                "description",
                "Observed facts without agent instructions",
                "textarea",
              ],
            ]
          : [["note", "What did you review?", "textarea"]];
  return (
    <form className="report-form evidence-form" onSubmit={submit}>
      <h3>{type === "approve_fix" ? "Human review" : "Record evidence"}</h3>
      {fields.map(([name, label, kind]) => (
        <label key={name}>
          {label}
          {kind === "textarea" ? (
            <textarea name={name} required rows={3} />
          ) : (
            <input
              name={name}
              type={kind === "number" ? "number" : "text"}
              required
            />
          )}
        </label>
      ))}
      <div className="button-row">
        <button className="button primary" disabled={busy}>
          Save evidence
        </button>
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
