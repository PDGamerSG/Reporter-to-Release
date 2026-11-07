# AWS engineering runtime

The service runs alongside Switch on the existing EC2 host. Four registered Switch identities separate the manager, reproducer, fixer, and advisory reviewer. Each bug gets a private room containing those identities and the owner. Native sender IDs differ from registered UUIDs; handoffs match the exact event ID returned by the authenticated send, addressed status and task content. No chat bridge is attached to these rooms.

The deployed provider is Meta's `muse-spark-1.3`, using the existing server-only project credential. The native Bedrock adapter is optional; actual larger requests were blocked by the AWS account token quota. `ENGINEERING_MODEL_PROVIDER=meta` selects the active provider explicitly. There is no automatic provider fallback.

## Work and authority

The manager reads paginated sanitized work from `GET /api/engineering/work`. `ENGINEERING_TOKEN` is separate from `WORKER_TOKEN`: engineering cannot answer on a reporter's behalf, claim concierge deliveries, approve a PR, merge, release quarantine, or record deployment. Engineering actions reuse the domain's state guards.

A separate task sends `POST /api/engineering/heartbeat` every 30 seconds, including while a model or sandbox stage is busy. It reports only the provider, model, service version and number of open role connections. Failed heartbeat requests retry without interrupting measured work; the task stops when the runtime exits. The live crew and connections pages require a heartbeat younger than 90 seconds and four open role connections before marking the service connected. Connection health does not assert model invocation availability or a successful test; those outcomes remain per-bug evidence. The manager is Python orchestration, and the three model roles display the provider actually reported by AWS. Demo roles remain illustrative.

Work is deliberately restricted to the ShopLite reference application's `src/lib/shoplite.ts` and a new `tests/agent-r2r-XXXX.test.ts`. Reports about other modules produce an operational note requesting human investigation. The runtime does not pretend to have reproduced an unsupported report.

Reproduction first runs the existing unit suite. The model writes only a regression test; a networkless container must measure an assertion failure, and a separate model review must check it against the dossier. The ledger then waits for the original reporter. No fix is scheduled before that reporter confirms the reproduction through their private capability.

The fixer cannot edit its failing assertion or existing tests. It gets at most two patch attempts, and must pass the new regression, existing unit suite, Prettier, ESLint and TypeScript. A trusted formatter may change layout without changing assertions. The reviewer assesses the exact source and measured output. Its review is advisory. The runtime then creates a **draft PR** with its actual base, head, patch and test evidence. Human review and merge remain required.

## Isolation and recovery

Trusted orchestration holds the GitHub credential and Docker socket. Generated code runs as UID 10001 in a separate container with no network, credentials, socket, capabilities, or writable root. A fixed Vitest entrypoint uses 384 MiB RAM, 0.75 CPU, 96 processes and a 120-second timeout; lint/type checks have a bounded 768 MiB allowance. Workspace edits reject other paths, symlinks, oversized output and traversal. Dependency locks must match the built sandbox.

The SQLite database under `/opt/r2r/engineering-state` persists completed reproduction, prepared patch and publication receipts. Delivery errors are separate from measured artifacts and retry after five minutes. Restarting publication reuses the exact prepared patch; any existing branch must match its tested source and base before it can be reused. Reporter rejection starts a fresh round and never replays the rejected test or old PR. The deployed daily limit is 20 model calls, including failures, preserved across restarts; it is separate from the web triage budget.

## Deploy and operate

Configure `ENGINEERING_TOKEN` in Vercel and the private local `.env.local`, plus the existing `GITHUB_TOKEN` and `MODEL_API_KEY`. The engineering GitHub credential needs Contents and Pull requests write for this repository. The concierge retains its separate credentials.

```sh
python3 scripts/deploy-engineering.py \
  --instance-id i-054399bd412a466f6 \
  --app-url https://reporter-to-release.pallabdas.me
```

The script sends public source through an encrypted private S3 archive with public access blocked, a fifteen-minute signed download and one-day expiry. Credentials travel in the private SSM payload, never in repository files or command arguments. Bootstrap keeps registration credentials on the host and writes only engineering-specific identities into `engineering.env`. A separate private probe room binds the manager's native transport sender using an authenticated receipt, then updates and restarts the concierge with that binding. It does not steal a session from the main engineering room. All host access uses Systems Manager; SSH remains closed.

Inspect `r2r-engineering-1` logs through Systems Manager. Logs contain stage IDs and error classes; do not print environment files or credential-bearing HTTP responses. Unsupported reports and failed model reviews need human investigation. To retry after correcting an operational problem, delete only that bug's `reproduce:failure` or `fix:failure` receipt through `State.delete`; retain its measured artifacts. A changed dependency lock requires rebuilding the sandbox through the deploy script.

The optional Bedrock mode needs [the model-specific policy](../../infra/bedrock-policy.json), `ENGINEERING_MODEL_PROVIDER=bedrock`, and a usable account quota. An available model catalog entry does not prove invocation access.

## Verification

```sh
uv run --project worker pytest -c worker/pyproject.toml worker/tests -q
docker build -f infra/engineering-sandbox.Dockerfile -t r2r-regression:current .
R2R_SANDBOX_TESTS=1 uv run --project worker pytest \
  -c worker/pyproject.toml worker/tests/test_sandbox_integration.py -q
```

CI runs three actual Docker checks separately. They measure a failing-to-passing assertion, verify that a test cannot read service credentials, the Docker socket or instance metadata, and reject a patch that passes Vitest but violates its TypeScript return type. Live acceptance evidence is recorded separately in [the test plan](../testing/test-plan.md); unit tests and an advisory model review are not human approval or a released customer fix.
