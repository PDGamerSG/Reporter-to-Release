# Reporter-to-Release implementation plan

## Goal and source

Deliver the approved Reporter-to-Release concept from the Hydra-Of-Malice planning and research repositories as a running, documented application. Preserve the privacy airlock, reporter confirmation, human merge boundary and deployment-driven notification loop.

## Architecture

Next.js serves a React operations dashboard and same-origin HTTP API. A tested TypeScript domain engine owns intake, sanitized dossiers, duplicate clusters, guarded state transitions, review risk, append-only events and a retryable outbox. Postgres persists a versioned ledger using compare-and-swap to prevent lost concurrent writes. A Python worker uses the research project's generic Switch protocol client for long-lived public and engineering room connections. It transfers only sanitized dossiers across the boundary. GitHub webhook signatures, delivery deduplication and commit ancestry gate production release notices.

Public visitors receive a private, seeded demonstration workspace with a signed cookie. Live workspace operations require an authenticated owner session. Reporter confirmation uses per-report capability tokens or authenticated chat identities; public identity strings never grant authority. Production secrets are generated outside source control. Missing third-party credentials must be shown as disconnected, never as a simulated live connection.

## Deliverables and checks

1. **Foundation**: create the private PDGamerSG/Reporter-to-Release repository, install the app and test tools, and provision a free durable database. Initial checkpoint commit. Preserve real commit times and space following commits at least 10 minutes apart while actively building.
2. **Backend domain** (`src/lib/domain`, `src/lib/store`, `tests`): test hostile text and PII rejection, duplicate aggregation, illegal transitions, reporter identity, human approval, production deployment mapping and outbox retries before implementing. Write the smallest code that passes those behavior tests.
3. **API and integrations** (`src/app/api`, `src/lib/integrations`, `worker`, `templates`): implement isolated workspaces, owner sessions, intake and tracking, signed GitHub/Telegram webhooks, durable outbox leases and acknowledgements, and Switch worker routing. Exercise API authorization and webhook replay. Send the requested backend-completion notification only after backend checks pass; identify any unconfigured external connections.
4. **Interface** (`src/components`, `src/app`, `src/styles`): build a responsive bug queue, evidence panel, activity trail, agent roster, integration status, quarantine review, release feed, reporter form and tracking page. Show failures and empty states. The visual direction is a quiet cloud-white workspace with ink navigation and restrained periwinkle accents; the evidence-to-release journey is the primary visual, with dense readable rows and contextual details.
5. **Seeded demo** (`src/lib/demo`, `src/app/shoplite`): demonstrate a coupon regression with an actual failing/passing executable test. Keep synthetic runs visibly labeled and separate from live production state. Never claim a demo button created a real PR or deployment.
6. **Release** (`docs`, `.github/workflows`, `scripts`): apply Readme Pro Max format, capture actual screenshots, document setup/configuration/API/security/limits, run typecheck, lint, unit/integration tests, browser end-to-end tests and production build. Deploy production to Vercel, attach reporter-to-release.pallabdas.me using the Namecheap skill, verify DNS/TLS and the immutable release, update the GitHub About fields and push the final spaced commit.

## Stop condition

The site and durable API are live on HTTPS, the core report-to-confirmation lifecycle passes automated checks, source and documentation are pushed, and external-service status is accurately recorded. Third-party authentication or ownership blockers are reported with the exact remaining step. Do not invent team names, accounts, credentials, real vendor executions or completed integrations.
