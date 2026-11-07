# Test plan

## Automated checks

Run these from a configured checkout:

```bash
npm ci
npm run setup
npm run format:check
npm run check
npm audit --audit-level=moderate
npm run build
uv sync --project worker --extra test --frozen
uv run --project worker pytest -c worker/pyproject.toml worker/tests -q
uv run --project worker ruff check worker/src/r2r_worker worker/src/r2r_engineering worker/tests
```

The application checks cover redaction/quarantine, guarded state transitions, wrong-reporter rejection, shared-key approval isolation, reviewed-head validation, review dismissal, signed event replay, out-of-order production deployment reconciliation, persistence contention, outbox leases, and an API-level report-to-release/reopen flow with two reporters. Sources: [tests](../../tests), especially [release boundaries](../../tests/release-boundaries.test.ts) and [end-to-end API](../../tests/end-to-end-api.test.ts).

Worker checks cover sender allowlists, native reporter identity, refusal of agent human-approval commands, recovery of an existing dossier after restart, and stale confirmations that must not block later reporters. Source: [worker tests](../../worker/tests).

Engineering checks cover allowed paths and symlinks, persistent model limits, reporter-gated scheduling, durable reproduction/prepared-patch receipts, reopening, isolated queue failures, exact tested-patch publication and native send-receipt authentication. Heartbeat checks cover independent publishing during slow work, recovery from HTTP failure, cancellation, separate service authority, schema validation, stale/partial connections and demo isolation. Recorder checks reject wrong SHA, preview/unready/wrong-project releases, unhealthy responses and stale aliases, and exercise idempotent publication. Sources: [engineering tests](../../worker/tests/test_engineering.py), [engineering API tests](../../tests/engineering.test.ts), [presentation tests](../../tests/presentation.test.ts), [recorder tests](../../tests/production-release.test.ts).

At backend checkpoint `db5c014`, [CI run 42379357450](https://github.com/PDGamerSG/Reporter-to-Release/actions/runs/42379357450) passed **112 TypeScript tests, 20 Python unit tests, three actual Docker integration tests and 16 browser scenarios**, plus formatting, lint, types, audit and production build. Python tests skip the three Docker cases unless explicitly enabled; the separate CI sandbox job enables and runs them.

```sh
docker build -f infra/engineering-sandbox.Dockerfile -t r2r-regression:current .
R2R_SANDBOX_TESTS=1 uv run --project worker pytest \
  -c worker/pyproject.toml worker/tests/test_sandbox_integration.py -q
```

The Docker cases measure an assertion failing then passing, verify the sandbox cannot read orchestrator secrets/socket/metadata, and reject a passing Vitest test with a TypeScript-invalid implementation. They execute containers rather than mocking Docker.

## Browser acceptance

Start the built application in one terminal, then run the suite in another:

```bash
npm run start -- --port 3107
```

```bash
npx playwright install chromium
npm run test:e2e
```

The original eight workspace scenarios cover queue search, evidence and Escape dismissal, session isolation, owner sign-in/sign-out, each workspace view, public intake accessibility, the synthetic complete lifecycle, ShopLite's real buggy/fixed calculation, missing capabilities, and desktop/mobile overflow. The one-page suite brings the total to 16; two [service-status scenarios](../../e2e/service-status.spec.ts) bring it to 18 by exercising the real heartbeat API, live provider labels and demo isolation. Axe checks use WCAG 2 A/AA and 2.1 AA tags. Passing these scans does not establish full accessibility conformance.

Set `E2E_BASE_URL` for another already-running environment. The service-status scenarios write heartbeat fixtures only on a loopback server whose health endpoint reports local storage. They skip hosted environments and Postgres-backed servers. For these scenarios, start the test server with `DATABASE_URL=''` and matching isolated `ADMIN_TOKEN` and `ENGINEERING_TOKEN` values in both terminals. CI supplies these temporary keys. No service fixture is submitted to the production ledger.

The remaining scenarios use isolated demo data or a read-only owner session. They do not submit a new live report or fake GitHub production events. The owner and service-status specs disable tracing to protect credentials. Source: [browser config](../../playwright.config.ts), [workspace spec](../../e2e/workspace.spec.ts), [owner spec](../../e2e/owner.spec.ts).

The one-page suite ([e2e/one-page.spec.ts](../../e2e/one-page.spec.ts)) mocks the model so CI needs no key. It covers complete output on desktop and mobile, accessibility before and after a result, failed triage and retry, quarantine, short input, live versus sample routing, the old `/report` address, and the tracker. Model behavior was checked separately against the real API, because mocks cannot prove it.

## Executable failing-to-passing example

```bash
npm run demo:reproduce
# Expected failure: observed -100, expected 0; exit 1.
npm run demo:reproduce -- --fixed
# Expected pass: payable amount clamped to zero; exit 0.
```

Both run a real Node assertion against [the shared ShopLite calculation](../../src/lib/shoplite.ts). The failing command is an intentional seeded defect, not a failed release check. The demo lifecycle's buttons simulate evidence and do not execute this assertion.

## CI

[Verify application](../../.github/workflows/ci.yml) runs on main pushes and pull requests. The application job installs the lockfile, checks formatting/types/lint/tests, audits dependencies, builds, starts a production server, and runs Playwright. The worker job installs the frozen uv lockfile and runs pytest and Ruff. The sandbox job builds and executes the restricted Docker image. CI uses isolated credentials and local file storage; it never contacts the production database or Switch instance. A separate [trusted-main recorder](../../.github/workflows/production.yml) reads actual Vercel release evidence after CI succeeds.

## Live evidence and its limits

The deployment acceptance on November 7, 2026 created the explicitly labeled live report **R2R-0001, Receipt preview stays blank** and [GitHub issue #1](https://github.com/PDGamerSG/Reporter-to-Release/issues/1). Intake returned 201, private tracking returned 200, and both acknowledgement and engineering-dossier jobs were delivered. The AWS worker connected both owned Switch rooms. GitHub's actual webhook ping returned 200. HTTPS health checks passed on the application and Switch host.

Implementation checkpoint `e28e764` passed [GitHub CI run 42370368347](https://github.com/PDGamerSG/Reporter-to-Release/actions/runs/42370368347): 46 TypeScript tests, 7 worker tests, and 8 browser scenarios. The same browser suite passed against the live custom hostname. All 11 JavaScript/CSS assets matched the immutable READY Vercel release; a focused search/evidence interaction produced no JavaScript or console errors.

After those checks, actual application release `e28e764` was recorded as GitHub production deployment `7620917538`. Its signed `deployment_status` delivery returned 200 at 12:06:56 UTC. This is genuine application deployment evidence, not a claim that the still-new acceptance bug was fixed.

That initial checkpoint proved live intake, persistence, private tracking, issue creation, room delivery and signed webhook connectivity. It did not demonstrate a model-written fix or customer resolution. The following backend acceptance is separate from that receipt-preview report.

### Backend engineering acceptance

Controlled report **R2R-0002** concerns a real unseeded ShopLite defect: normal `calculateTotal(1e308, 1, "", false)` returns `Infinity`, while the report explicitly expects rejection of an amount that cannot be safe integer cents. On AWS, the reproducer generated a Vitest regression at exact base `db5c014`; the networkless container measured its assertion failure, and a separate advisory review accepted its correspondence to the dossier at 14:00:49 UTC. The original acceptance reporter independently reproduced the same result. No unrelated reporter's capability was used.

The machine-readable [acceptance record](../evidence/2026-11-07-backend-acceptance.json) contains the source, measured output, actual revisions and production evidence. It excludes private tracking credentials. Operational failures remain in the audit trail; no simulation was substituted for those failed attempts.

The original acceptance reporter confirmed that measured reproduction at 14:08:22 UTC. The fixer then passed the unchanged regression, all **113** unit tests, Prettier, ESLint and TypeScript in the networkless AWS sandbox. Advisory review accepted the exact patch. At 14:09:29 UTC the service opened [draft PR #4](https://github.com/PDGamerSG/Reporter-to-Release/pull/4), head `496f9aae9d7e66865517ef4b6bde21473f281834`, changing only the ShopLite implementation and its new regression. [Independent PR CI run 42380265587](https://github.com/PDGamerSG/Reporter-to-Release/actions/runs/42380265587) passed application, worker and actual Docker checks. At that point the live ledger was at `review`; human approval, merge and reporter-confirmed production resolution were not manufactured. PR #4 was merged later that day at 15:37:39 UTC.

The automatic recorder also succeeded for `db5c014` in [run 42379443206](https://github.com/PDGamerSG/Reporter-to-Release/actions/runs/42379443206), created GitHub deployment `7622102550`, and received an actual signed webhook delivery with HTTP 200 at 13:59:43 UTC. This proves deployment recording for the application; it does not imply that the acceptance bug has been merged or released.
