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
| `GITHUB_WEBHOOK_SECRET`   | Generated; required for GitHub relay                 | [Relay](../src/lib/integrations/github.ts): HMAC verification of the exact raw webhook body.                                                                                                                                   |
| `GITHUB_TOKEN`            | Empty; needed for issue creation and ancestry checks | [Relay](../src/lib/integrations/github.ts): GitHub REST credential for the configured target repository. Use a repository-scoped credential with Issues write and the read permissions required for PRs and commit comparison. |
| `GITHUB_REPOSITORY`       | `PDGamerSG/Reporter-to-Release`                      | [API](../src/lib/api.ts) and relay: issue destination and webhook repository allowlist.                                                                                                                                        |
| `OWNER_GITHUB_LOGINS`     | `PDGamerSG`                                          | [Relay](../src/lib/integrations/github.ts): comma-separated human GitHub reviewers allowed to approve. Chat handles and organization names are not verified human logins.                                                      |
| `CODEOWNER_GITHUB_LOGINS` | `PDGamerSG`                                          | [Relay](../src/lib/integrations/github.ts): subset counted as code owners by the ledger. Keep consistent with [.github/CODEOWNERS](../.github/CODEOWNERS).                                                                     |

Set production variables in Vercel, then redeploy: an environment change does not update an existing deployment. Run `npm run db:init` once with the production database configuration before serving traffic. The migration is idempotent.

The current owner list has one verified human. Add a second authorized human GitHub login before attempting a sensitive-path merge. Do not weaken the two-human rule to make a demonstration pass. Configure matching GitHub branch protection separately; a ledger gate does not itself prevent a repository administrator from bypassing GitHub controls.

## Switch worker

The worker reads the same `APP_URL` and `WORKER_TOKEN`, plus the following fields. [bootstrap-switch.py](../scripts/bootstrap-switch.py) generates owned agent credentials and room identifiers on the host. [deploy-worker.py](../scripts/deploy-worker.py) keeps repository credentials and registration keys out of the worker container.

| Variable                       | Required / default                                               | Purpose                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `SWITCH_URL`                   | `http://localhost:8100` locally; `http://switch:8000` in compose | Switch protocol API origin.                                                                                                              |
| `SWITCH_AGENT_ID`              | Required                                                         | Concierge agent ID registered in the owned workspace.                                                                                    |
| `SWITCH_API_KEY`               | Required, private                                                | Concierge's agent-specific protocol credential.                                                                                          |
| `SWITCH_PUBLIC_ROOM`           | Required                                                         | Owned intake room. The deployed web intake does not require a Telegram bridge.                                                           |
| `SWITCH_ENGINEERING_ROOM`      | Required                                                         | Private engineering room for sanitized dossiers.                                                                                         |
| `SWITCH_ENGINEERING_AGENT_IDS` | Required for engineering commands                                | Comma-separated IDs whose structured engineering messages the worker accepts. Register and authorize each additional runtime explicitly. |
| `SWITCH_MANAGER_NAME`          | `vulcan-manager`                                                 | Named target for engineering dossier handoffs. Registration alone does not authenticate its model provider.                              |
| `WORKER_STATE_PATH`            | `.data/worker.sqlite` locally; `/state/worker.sqlite` in compose | Persistent SQLite receipts for reconnect/restart delivery handling.                                                                      |

Source: [worker main](../worker/src/r2r_worker/main.py) and [boundary checks](../worker/src/r2r_worker/boundary.py).

## Host setup and later chat connections

[setup-switch-host.sh](../scripts/setup-switch-host.sh) accepts `R2R_SWITCH_HOST` and `R2R_ADMIN_EMAIL`. It generates the upstream Switch secrets on a fresh host and preserves an existing `.env`. The upstream Switch server has its own database, admin credentials, and keyring. These are separate from the application's ledger and session secret.

Telegram and Slack are deferred by the project scope. Add their credentials through Switch Console when enabling bridges. The current example file deliberately requests no chat tokens. Do not expose a new public bridge to engineering agents without checking room membership and addressing policies.

For local browser checks, set `E2E_BASE_URL` to the already-running server, for example `http://127.0.0.1:3107`. The Playwright configuration loads `.env.local`; owner sign-in tests skip when `ADMIN_TOKEN` is absent. CI uses isolated placeholder secrets and no production database.
