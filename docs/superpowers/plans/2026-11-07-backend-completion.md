# Backend Completion Implementation Plan

**Goal:** Run the existing reporter-to-release engineering flow on AWS and automate verified production evidence.

**Architecture:** Reuse the guarded ledger, Switch client, Postgres store, and Vercel deployment. Add an isolated engineering service and a trusted-main production recorder.

**Spec:** [Backend completion design](../../operations/backend-completion.md)

## Constraints

- Preserve concurrent frontend and AI-triage edits.
- Use AWS role credentials for Bedrock, a separate engineering bearer, and no repository credential in the concierge.
- Restrict generated changes to `src/lib/shoplite.ts` and the bug's regression test.
- Require reporter confirmation before fixing. The engineering service publishes draft PRs and cannot approve or merge them; an operator may act on the owner's explicit instructions outside that runtime.
- Keep real commits at least ten minutes apart; document actual provenance and validation.

## Tasks

- [x] Write failing HTTP tests for a sanitized engineering work snapshot, separate authority, reporter gate, and rejected approval/deployment commands. Implement `src/lib/engineering.ts` and add its route in `src/lib/api.ts`; run the focused tests.
- [x] Write failing Python tests for path/symlink restrictions, actual failing/passing sandbox execution, model JSON validation, persistent call limits, and idempotent PR publication. Implement `worker/src/r2r_engineering/` and run the focused worker suite.
- [x] Write failing TypeScript tests for wrong-SHA, preview, unready, wrong-project, stale-alias, and unhealthy production evidence. Implement `scripts/production-release.ts` and the trusted-main GitHub workflow; run the focused tests.
- [x] Extend bootstrap/deployment scripts for private engineering identities and restricted Bedrock IAM. Deploy, invoke the real model, exercise the networkless sandbox, and prove a live Switch handoff.
- [x] Submit a clearly labeled controlled acceptance report; preserve its original reporter capability, confirm only its actual reproduction, and verify a real model-generated draft PR. Link that PR to this thread.
- [x] Run required backend checks, review changes, commit verified chunks with real spacing, deploy, verify the automated production event, and update backend docs and README truthfully at the end.

## Verified outcome

AWS handoffs, isolated reproduction and fix execution, original acceptance reporter confirmation, and draft PR #4 were verified at the backend checkpoint. PR head `496f9aa` passed all CI jobs and 113 TypeScript tests on its original base. The automatic recorder verified main checkpoint `db5c014` and delivered its actual signed production webhook with HTTP 200. See [acceptance evidence](../../evidence/2026-11-07-backend-acceptance.json). The deployed provider is explicitly Meta because real Bedrock requests hit account quota; the AWS role adapter remains optional.

The owner later explicitly approved the exact PR head and requested its merge. Merge `d81ba99` passed combined CI with 124 TypeScript tests, 21 Python unit tests, three Docker integration tests and 18 browser scenarios, then reached verified production. The original controlled acceptance runner checked the calculation module at that revision and confirmed release through its original reporter capability at 15:45:13 UTC. The live report is `verified`; the engineering service itself still cannot approve or merge. See [controlled release completion](../../evidence/2026-11-07-controlled-release.json).
