# Configuration

Run `npm run setup` after `npm ci`. It creates a private `.env.local` from [.env.example](../.env.example), generates independent secrets, and preserves an existing configuration. Never commit `.env.local`, worker environment files, Switch registration credentials, or browser storage.

## Web application

| Variable                  | Required / default                                   | Consumer and purpose                                                                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`            | Empty locally; required in production                | [Store](../src/lib/store/index.ts): Neon-compatible Postgres connection. Empty uses a single-process local file ledger.                                                                                                        |
| `APP_URL`                 | `http://localhost:3000` in the example               | [Layout](../src/app/layout.tsx): metadata origin. Set the deployed HTTPS custom URL.                                                                                                                                           |
| `SESSION_SECRET`          | Generated; at least 32 characters in production      | [Security](../src/lib/security.ts): signs demo/owner cookies and derives pseudonymous identities. Rotation invalidates sessions and changes future identity hashes; tracking capabilities remain independent.                  |
| `ADMIN_TOKEN`             | Generated                                            | [API](../src/lib/api.ts): shared owner access key. Enter only in the owner sign-in dialog.                                                                                                                                     |
| `WORKER_TOKEN`            | Generated                                            | [API](../src/lib/api.ts) and worker: server-to-server bearer credential. Must match on both services.                                                                                                                          |
| `ENGINEERING_TOKEN`       | Required for AWS engineering                         | [Engineering API](../src/lib/engineering.ts): independent bearer for sanitized work, engineering actions and notes. It grants no reporter, approval, merge or deployment authority.                                            |
| `GITHUB_WEBHOOK_SECRET`   | Generated; required for GitHub relay                 | [Relay](../src/lib/integrations/github.ts): HMAC verification of the exact raw webhook body.                                                                                                                                   |
| `GITHUB_TOKEN`            | Empty; needed for issue creation and ancestry checks | [Relay](../src/lib/integrations/github.ts): GitHub REST credential for the configured target repository. Use a repository-scoped credential with Issues write and the read permissions required for PRs and commit comparison. |
| `GITHUB_REPOSITORY`       | `PDGamerSG/Reporter-to-Release`                      | [API](../src/lib/api.ts) and relay: issue destination and webhook repository allowlist.                                                                                                                                        |
| `OWNER_GITHUB_LOGINS`     | `PDGamerSG`                                          | [Relay](../src/lib/integrations/github.ts): comma-separated human GitHub reviewers allowed to approve. Chat handles and organization names are not verified human logins.                                                      |
| `CODEOWNER_GITHUB_LOGINS` | `PDGamerSG`                                          | [Relay](../src/lib/integrations/github.ts): subset counted as code owners by the ledger. Keep consistent with [.github/CODEOWNERS](../.github/CODEOWNERS).                                                                     |

### AI triage

| Variable                  | Required / default       | Consumer and purpose                                                                                                                                                        |
| ------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MODEL_API_KEY`           | Empty disables triage    | [Proxy](../src/lib/ai/triage.ts): Meta Model API key. Server-only: never prefix it with `NEXT_PUBLIC_`. Reports still work without it; the page says triage is unavailable. |
| `MODEL_ID`                | `muse-spark-1.3`         | [Proxy](../src/lib/ai/triage.ts): model. Contributor models are refused because their terms allow training on prompts.                                                      |
| `MODEL_API_BASE_URL`      | `https://api.meta.ai/v1` | [Proxy](../src/lib/ai/triage.ts): API origin.                                                                                                                               |
| `LLM_BUDGET_USD`          | `5`                      | [Proxy](../src/lib/ai/triage.ts): total spend cap across all time, held in the ledger. Raising it is the only way to resume after the cap is reached.                       |
| `LLM_HOURLY_LIMIT`        | `60`                     | [Proxy](../src/lib/ai/triage.ts): model calls per hour across all visitors.                                                                                                 |
| `LLM_CLIENT_HOURLY_LIMIT` | `10`                     | [Proxy](../src/lib/ai/triage.ts): model calls per hour for one client address.                                                                                              |

The cap counts this application's calls, priced from the provider's published rates. It cannot read the account's credit balance or stop a payment method from being charged, so confirm the remaining credit in the Model API dashboard before raising it. The signed-in owner can read recorded spend at `GET /api/ai/usage`.

Set production variables in Vercel, then redeploy: an environment change does not update an existing deployment. Run `npm run db:init` once with the production database configuration before serving traffic. The migration is idempotent.

The current owner list has one verified human. Add a second authorized human GitHub login before attempting a sensitive-path merge. Do not weaken the two-human rule to make a demonstration pass. Configure matching GitHub branch protection separately; a ledger gate does not itself prevent a repository administrator from bypassing GitHub controls.

## Switch worker

The worker reads the same `APP_URL` and `WORKER_TOKEN`, plus the following fields. [bootstrap-switch.py](../scripts/bootstrap-switch.py) generates owned agent credentials and room identifiers on the host. [deploy-worker.py](../scripts/deploy-worker.py) keeps repository credentials and registration keys out of the worker container.

| Variable                       | Required / default                                               | Purpose                                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SWITCH_URL`                   | `http://localhost:8100` locally; `http://switch:8000` in compose | Switch protocol API origin.                                                                                                                              |
| `SWITCH_AGENT_ID`              | Required                                                         | Concierge agent ID registered in the owned workspace.                                                                                                    |
| `SWITCH_API_KEY`               | Required, private                                                | Concierge's agent-specific protocol credential.                                                                                                          |
| `SWITCH_PUBLIC_ROOM`           | Required                                                         | Owned intake room. The deployed web intake does not require a Telegram bridge.                                                                           |
| `SWITCH_ENGINEERING_ROOM`      | Required                                                         | Private engineering room for sanitized dossiers.                                                                                                         |
| `SWITCH_ENGINEERING_AGENT_IDS` | Required for engineering commands                                | Native transport senders accepted by the concierge. Deployment binds the manager through its authenticated send receipt; names alone grant no authority. |
| `SWITCH_MANAGER_NAME`          | `vulcan-manager`                                                 | Named target for engineering dossier handoffs. Registration alone does not authenticate its model provider.                                              |
| `WORKER_STATE_PATH`            | `.data/worker.sqlite` locally; `/state/worker.sqlite` in compose | Persistent SQLite receipts for reconnect/restart delivery handling.                                                                                      |

Source: [worker main](../worker/src/r2r_worker/main.py) and [boundary checks](../worker/src/r2r_worker/boundary.py).

## AWS engineering service

The separate service uses `APP_URL`, `ENGINEERING_TOKEN`, `GITHUB_REPOSITORY`, and a repository credential with Contents and Pull requests write. The concierge receives none of that repository credential. [Deployment](../scripts/deploy-engineering.py) writes private configuration on the host; [bootstrap](../scripts/bootstrap-switch.py) adds four agent-specific IDs and keys.

| Variable                                        | Deployed value or purpose                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ENGINEERING_MODEL_PROVIDER`                    | `meta`; explicit provider selection without automatic fallback.                           |
| `MODEL_API_KEY`                                 | Existing server-only Meta credential. The engineering model is `muse-spark-1.3`.          |
| `ENGINEERING_DAILY_MODEL_CALLS`                 | `20`, including failed calls, persisted across restarts; independent of web triage spend. |
| `ENGINEERING_STATE_DIR`                         | `/opt/r2r/engineering-state`, persistent receipts, prepared patches and run workspaces.   |
| `SWITCH_MANAGER_ID`, `SWITCH_MANAGER_KEY`       | Trusted manager's registration credentials.                                               |
| `SWITCH_REPRODUCER_ID`, `SWITCH_REPRODUCER_KEY` | Reproduction role's registration credentials.                                             |
| `SWITCH_FIXER_ID`, `SWITCH_FIXER_KEY`           | Fix role's registration credentials.                                                      |
| `SWITCH_REVIEWER_ID`, `SWITCH_REVIEWER_KEY`     | Advisory review role's registration credentials.                                          |
| `BEDROCK_REGION`, `BEDROCK_MODEL_ID`            | Optional Bedrock mode only; requires EC2 role permission and usable account quota.        |

Generated tests and implementation code receive no environment credentials. Their sandbox has no network or Docker socket. See [the runtime runbook](operations/engineering-runtime.md) for bounded scope, deployment and recovery.

## Host setup and later chat connections

[setup-switch-host.sh](../scripts/setup-switch-host.sh) accepts `R2R_SWITCH_HOST` and `R2R_ADMIN_EMAIL`. It generates the upstream Switch secrets on a fresh host and preserves an existing `.env`. The upstream Switch server has its own database, admin credentials, and keyring. These are separate from the application's ledger and session secret.

Telegram updates need `TELEGRAM_BOT_USERNAME` and `TELEGRAM_WEBHOOK_SECRET` in Vercel, and `TELEGRAM_BOT_TOKEN` on the AWS worker. Register the webhook with that secret. Slack stays deferred; add its credentials through Switch Console when enabling it.

Screenshots need `SCREENSHOT_BUCKET` and credentials in Vercel. Production uses `SCREENSHOT_AWS_ACCESS_KEY_ID` and `SCREENSHOT_AWS_SECRET_ACCESS_KEY` for IAM user `r2r-vercel-screenshots`, which can only read and write `reports/*`, because this AWS organization denies creating OIDC providers. Rotate that key periodically. If the organization allows OIDC, `scripts/setup-screenshot-role.sh` creates a keyless role instead; set `SCREENSHOT_ROLE_ARN` and remove the key. The upload control stays hidden until credentials are set.

For local browser checks, set `E2E_BASE_URL` to the already-running server, for example `http://127.0.0.1:3107`. The Playwright configuration loads `.env.local`; owner sign-in tests skip when `ADMIN_TOKEN` is absent. CI uses isolated placeholder secrets and no production database.
