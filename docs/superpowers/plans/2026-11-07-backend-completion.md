# Backend Completion Implementation Plan

**Goal:** Run the existing reporter-to-release engineering flow on AWS and automate verified production evidence.

**Architecture:** Reuse the guarded ledger, Switch client, Postgres store, and Vercel deployment. Add an isolated engineering service and a trusted-main production recorder.

**Spec:** [Backend completion design](../../operations/backend-completion.md)

## Constraints

- Preserve concurrent frontend and AI-triage edits.
- Use AWS role credentials for Bedrock, a separate engineering bearer, and no repository credential in the concierge.
- Restrict generated changes to `src/lib/shoplite.ts` and the bug's regression test.
- Require reporter confirmation before fixing; publish draft PRs without human approvals or merges.
- Keep real commits at least ten minutes apart; document actual provenance and validation.

## Tasks

- [ ] Write failing HTTP tests for a sanitized engineering work snapshot, separate authority, reporter gate, and rejected approval/deployment commands. Implement `src/lib/engineering.ts` and add its route in `src/lib/api.ts`; run the focused tests.
- [ ] Write failing Python tests for path/symlink restrictions, actual failing/passing sandbox execution, model JSON validation, persistent call limits, and idempotent PR publication. Implement `worker/src/r2r_engineering/` and run the focused worker suite.
- [ ] Write failing TypeScript tests for wrong-SHA, preview, unready, wrong-project, stale-alias, and unhealthy production evidence. Implement `scripts/production-release.ts` and the trusted-main GitHub workflow; run the focused tests.
- [ ] Extend bootstrap/deployment scripts for private engineering identities and restricted Bedrock IAM. Deploy, invoke the real model, exercise the networkless sandbox, and prove a live Switch handoff.
- [ ] Submit a clearly labeled controlled acceptance report; preserve its original reporter capability, confirm only its actual reproduction, and verify a real model-generated draft PR. Link that PR to this thread.
- [ ] Run required backend checks, review changes, commit verified chunks with real spacing, deploy, verify the automated production event, and update backend docs and README truthfully at the end.
