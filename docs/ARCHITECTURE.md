# Architecture

The Next.js application owns the workflow and its durable state. A Python worker connects two owned Switch rooms and delivers the application's outbox. GitHub supplies signed review, merge, and deployment evidence. Public reporters use the web form and a private capability link.

## System context

```mermaid
flowchart LR
  reporter["Reporter<br/>web browser"] --> app["Bug desk<br/>Next.js application"]
  owner["Human owner<br/>authenticated browser"] --> app
  app --> ledger[("Ledger<br/>Neon Postgres")]
  worker["Concierge worker<br/>AWS EC2"] --> app
  worker <--> switch["Owned rooms<br/>Switch server on AWS"]
  app --> github["Issues and commit comparison<br/>GitHub API"]
  github -.-> app
  runtimes["Engineering manager and model stages<br/>Python service on AWS"] <--> switch
  runtimes --> app
  runtimes --> sandbox["Generated-code execution<br/>networkless Docker sandbox"]
  runtimes --> github
  chat["Telegram and Slack<br/>deferred"] -.-> switch
```

Sources: [API](../src/lib/api.ts), [worker](../worker/src/r2r_worker/main.py), [engineering runtime](../worker/src/r2r_engineering/runtime.py), [GitHub relay](../src/lib/integrations/github.ts), [engineering compose](../infra/engineering.compose.yml). Telegram and Slack remain deferred. The active engineering service runs model stages through four Switch identities; model review is advisory.

## Components

```mermaid
flowchart LR
  pages["Dashboard and reporter pages<br/>src/app and src/components"] --> routes["HTTP dispatcher<br/>src/app/api and src/lib/api.ts"]
  routes --> http["Sessions and same-origin checks<br/>src/lib/http.ts"]
  routes --> schemas["Strict request validation<br/>src/lib/schemas.ts"]
  routes --> domain["Guarded workflow<br/>src/lib/domain/workflow.ts"]
  domain --> airlock["Redaction and quarantine<br/>src/lib/domain/airlock.ts"]
  routes --> store["Compare-and-swap persistence<br/>src/lib/store/index.ts"]
  routes --> relay["Signed GitHub events<br/>src/lib/integrations/github.ts"]
  concierge["Persistent room connections<br/>worker/src/r2r_worker"] --> routes
  concierge --> client["Reused protocol client<br/>worker/src/switchkit"]
```

Sources: the paths in the node labels. The [provenance record](EVENT_CONTRIBUTION.md) identifies the imported client and its event-period modification.

## Intake sequence

```mermaid
sequenceDiagram
  actor Reporter
  participant Web as Web form
  participant API as Next.js API
  participant DB as Postgres ledger
  participant Worker as Python worker
  participant Switch as Engineering room
  Reporter->>Web: Submit observed behavior
  Web->>API: POST /api/intake
  API->>API: Validate, redact, detect instructions, cluster
  API->>DB: Compare-and-swap report, audit event, outbox
  API-->>Web: Report ID and private tracking token
  Web-->>Reporter: Tracking link with token in URL fragment
  Worker->>API: Claim leased outbox jobs
  Worker->>Switch: Store sanitized dossier and address manager
  Worker->>API: Acknowledge delivery with lease ID
  Reporter->>API: Read tracking with X-Reporter-Token
  API-->>Reporter: Authorized status and evidence
```

After intake, the reporter's browser requests AI triage with its private capability. The [proxy](../src/lib/ai/triage.ts) reserves budget, sends the sanitized dossier to the Meta Model API behind a frozen cached prompt prefix, validates the result, and stores it on the cluster. It is advisory and cannot change state. A live issue receives it in its body or as a comment.

Sources: [BugDesk](../src/components/bug-desk.tsx), [API](../src/lib/api.ts), [airlock](../src/lib/domain/airlock.ts), [outbox](../src/lib/domain/outbox.ts), [worker](../worker/src/r2r_worker/main.py). Quarantined input produces no engineering dossier job. Web updates are read on the private tracking page; there is no email or browser push delivery.

## Lifecycle and authority

```mermaid
stateDiagram-v2
  [*] --> new
  [*] --> quarantined
  quarantined --> new: Human replaces report with clean facts
  new --> reproducing: Engineering starts reproduction
  reproducing --> awaiting_reporter: Failing test evidence recorded
  awaiting_reporter --> confirmed: Original reporter agrees
  awaiting_reporter --> reopened: Reporter rejects reproduction
  confirmed --> fixing: Engineering starts fix
  fixing --> review: Pull request and passing output recorded
  review --> merged: Signed GitHub event and human approvals
  merged --> deployed: Successful production deployment contains merge
  deployed --> verified: Reporter confirms live fix
  deployed --> reopened: Reporter still sees failure
  verified --> reopened: Another affected reporter rejects release
  reopened --> reproducing
```

Source: [workflow](../src/lib/domain/workflow.ts). At least one affected reporter must confirm the reproduction before fixing. A release remains rejectable by another member of the cluster after the first reporter verifies it. Sensitive paths require two distinct human approvals, including a configured code owner. The production owner configuration currently lists one human, so a second verified human must be added before a sensitive fix can pass that gate.

The ledger validates who supplied evidence and the allowed transition. Sensitive approvals count distinct human identities verified by signed GitHub reviews; the shared owner web key cannot satisfy that gate. The ledger does not execute submitted shell commands or prove that pasted test output is authentic. Humans and configured engineering runtimes are responsible for running and reviewing the tests. The isolated demo uses explicit simulation controls and cannot record a real merge or deployment.

## Engineering execution and production recording

The [engineering service](../worker/src/r2r_engineering/runtime.py) reads sanitized work with an independent bearer, creates a private room per bug, and sends targeted tasks between manager, reproducer, fixer and reviewer. Native transport sender IDs differ from registered agent UUIDs. Each handoff matches the authenticated send receipt's event ID, addressed flag and exact task body. The concierge's legacy command allowlist is bound through a separate private receipt probe, never through a display name.

The reproducer clones the public main revision without a GitHub credential, checks the existing unit suite, and proposes only a new regression. A networkless sandbox must measure a genuine assertion failure. An independent advisory model review checks it against the dossier. The service records that evidence, then waits for the original reporter's capability-backed confirmation.

Fixes can change only `src/lib/shoplite.ts`; the new regression is retained. The sandbox measures the regression, existing unit suite, formatting, ESLint and TypeScript before a draft PR can be published. Models return bounded JSON file contents, never shell instructions. SQLite persists call budgets, measured artifacts, prepared patches and publication receipts. Existing PR branches must match the tested files and base before reuse. Reports outside this module require human investigation. Sources: [sandbox](../worker/src/r2r_engineering/sandbox.py), [publisher](../worker/src/r2r_engineering/github.py), [state](../worker/src/r2r_engineering/state.py).

The [production recorder](../scripts/production-release.ts) runs only after successful trusted-main CI. It verifies the exact full SHA, project, team, production target, READY state, immutable health and custom-domain alias before recording GitHub deployment success. GitHub then sends the real signed webhook. See [the recorder runbook](operations/production-recorder.md).

## Data model

One physical table, `r2r_ledgers`, stores each workspace as a versioned JSON document. A live workspace uses the key `live`; each demo uses a separate signed-session-derived key. The following entities are logical objects inside that document, not separate SQL tables.

```mermaid
erDiagram
  LEDGER ||--o{ CLUSTER : contains
  LEDGER ||--o{ AUDIT_EVENT : records
  LEDGER ||--o{ OUTBOX_JOB : queues
  CLUSTER ||--o{ REPORT : groups
  CLUSTER ||--o| REPRODUCTION : proves
  CLUSTER ||--o| FIX : proposes
  CLUSTER ||--o| RELEASE : ships
  REPORT ||--o{ OUTBOX_JOB : receives
```

Sources: [types](../src/lib/domain/types.ts), [migration](../migrations/001_ledger.sql), [store](../src/lib/store/index.ts). `version` supports compare-and-swap; mutations retry after contention. Raw report bodies are discarded after redaction and hashing. Private tracking tokens are stored only as hashes. Audit entries are append-only through application operations; the database administrator can still alter stored documents.

Successful production deployments remain in an optional ledger history so a later-arriving merge can reconcile them. Ancestry checks use the current mutation snapshot and are recalculated after compare-and-swap contention. Reporter tracking uses an allowlisted projection of safe observations, reproduction summary/steps, and release information; internal commands, review notes, test paths, and private screenshots are excluded.

Outbox claims use leases, attempt counters, due times, and acknowledgement IDs. Failed deliveries retry with bounded exponential delay. The worker stores delivery receipts in a persistent SQLite file and reuses existing dossier documents after a restart. External chat sends can still repeat if the process dies between sending and persisting its receipt; this is at-least-once delivery, not a universal exactly-once guarantee.

## Deployment

```mermaid
flowchart LR
  dns["Custom DNS<br/>Namecheap"] --> vercel["HTTPS web and API<br/>Vercel production"]
  vercel --> neon[("Application ledger<br/>Neon Postgres")]
  dns --> caddy["HTTPS reverse proxy<br/>Caddy on EC2"]
  caddy --> switch["Switch container<br/>pinned upstream release"]
  switch --> pg[("Switch database<br/>Docker volume")]
  worker["Python worker container<br/>persistent SQLite receipts"] --> switch
  worker --> vercel
  engineering["Engineering service<br/>persistent stage receipts"] --> switch
  engineering --> vercel
  engineering --> sandbox["Disposable regression container<br/>no network or credentials"]
  ssm["Host administration<br/>AWS Systems Manager"] --> worker
```

Sources: [host setup](../scripts/setup-switch-host.sh), [worker deployment](../scripts/deploy-worker.py), [Caddyfile](../infra/Caddyfile), [worker compose](../infra/worker.compose.yml). EC2 accepts public ports 80 and 443. The Switch and database ports bind to loopback. There is no SSH ingress. The EC2 instance is a single host; it is not a highly available cluster.
