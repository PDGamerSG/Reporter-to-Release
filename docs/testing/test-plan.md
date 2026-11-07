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
uv run --project worker ruff check worker/src/r2r_worker worker/tests
```

The application checks cover redaction/quarantine, guarded state transitions, wrong-reporter rejection, shared-key approval isolation, reviewed-head validation, review dismissal, signed event replay, out-of-order production deployment reconciliation, persistence contention, outbox leases, and an API-level report-to-release/reopen flow with two reporters. Sources: [tests](../../tests), especially [release boundaries](../../tests/release-boundaries.test.ts) and [end-to-end API](../../tests/end-to-end-api.test.ts).

Worker checks cover sender allowlists, native reporter identity, refusal of agent human-approval commands, recovery of an existing dossier after restart, and stale confirmations that must not block later reporters. Source: [worker tests](../../worker/tests).

## Browser acceptance

Start the built application in one terminal, then run the suite in another:

```bash
npm run start -- --port 3107
```

```bash
npx playwright install chromium
npm run test:e2e
```

The eight scenarios cover queue search, evidence and Escape dismissal, session isolation, owner sign-in/sign-out, each workspace view, public intake accessibility, the synthetic complete lifecycle, ShopLite's real buggy/fixed calculation, missing capabilities, and desktop/mobile overflow. Axe checks use WCAG 2 A/AA and 2.1 AA tags. Passing these scans does not establish full accessibility conformance.

Set `E2E_BASE_URL` for another already-running environment. The suite mutates only isolated demo data, aside from a read-only live owner session. It does not submit a new live report or fake GitHub production events. The owner test disables tracing to protect credentials. Source: [browser config](../../playwright.config.ts), [workspace spec](../../e2e/workspace.spec.ts), [owner spec](../../e2e/owner.spec.ts).

## Executable failing-to-passing example

```bash
npm run demo:reproduce
# Expected failure: observed -100, expected 0; exit 1.
npm run demo:reproduce -- --fixed
# Expected pass: payable amount clamped to zero; exit 0.
```

Both run a real Node assertion against [the shared ShopLite calculation](../../src/lib/shoplite.ts). The failing command is an intentional seeded defect, not a failed release check. The demo lifecycle's buttons simulate evidence and do not execute this assertion.

## CI

[Verify application](../../.github/workflows/ci.yml) runs on main pushes and pull requests. The application job installs the lockfile, checks formatting/types/lint/tests, audits dependencies, builds, starts a production server, and runs Playwright. The worker job installs the frozen uv lockfile and runs pytest and Ruff. CI uses isolated credentials and local file storage; it never contacts the production database or Switch instance.

## Live evidence and its limits

The deployment acceptance on November 7, 2026 created the explicitly labeled live report **R2R-0001, Receipt preview stays blank** and [GitHub issue #1](https://github.com/PDGamerSG/Reporter-to-Release/issues/1). Intake returned 201, private tracking returned 200, and both acknowledgement and engineering-dossier jobs were delivered. The AWS worker connected both owned Switch rooms. GitHub's actual webhook ping returned 200. HTTPS health checks passed on the application and Switch host.

Implementation checkpoint `e28e764` passed [GitHub CI run 42370368347](https://github.com/PDGamerSG/Reporter-to-Release/actions/runs/42370368347): 46 TypeScript tests, 7 worker tests, and 8 browser scenarios. The same browser suite passed against the live custom hostname. All 11 JavaScript/CSS assets matched the immutable READY Vercel release; a focused search/evidence interaction produced no JavaScript or console errors.

After those checks, actual application release `e28e764` was recorded as GitHub production deployment `7620917538`. Its signed `deployment_status` delivery returned 200 at 12:06:56 UTC. This is genuine application deployment evidence, not a claim that the still-new acceptance bug was fixed.

This proves live intake, persistence, private tracking, issue creation, room delivery, and signed webhook connectivity. The merge/deployment/verification/reopen lifecycle is proven by isolated automated tests and the clearly marked demo. No model-written live fix, real fix PR, human merge, or reporter-confirmed production fix is claimed by that acceptance report.
