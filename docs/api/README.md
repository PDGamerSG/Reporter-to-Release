# HTTP API

The dispatcher is [src/lib/api.ts](../../src/lib/api.ts), served by the [catch-all route](../../src/app/api/[...path]/route.ts). Responses are JSON with `Cache-Control: no-store`. Validation uses strict [Zod schemas](../../src/lib/schemas.ts). Errors return `{ "error": "Human-readable explanation" }`.

Browser writes require `Content-Type: application/json` and an `Origin` matching the destination Host. JSON bodies are limited to 32 KiB. The separately signed GitHub webhook accepts up to 1 MiB. Reporter identity, actor roles, and merge/deployment commands are never accepted from a public form.

## Public and owner endpoints

| Method and path                   | Authority                          | Behavior                                                                                                                                                               |
| --------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                 | Public                             | Reports service availability.                                                                                                                                          |
| `GET /api/workspace`              | Signed demo cookie or owner cookie | Returns the isolated demo or live owner workspace. Explicit `?mode=demo` forces demo isolation.                                                                        |
| `POST /api/intake`                | Public, same origin                | Creates a live web report and returns its private tracking token once.                                                                                                 |
| `POST /api/reports?mode=demo`     | Demo session, same origin          | Creates an isolated demonstration report.                                                                                                                              |
| `POST /api/auth`                  | Owner key, same origin             | Exchanges `{ "token": "..." }` for an HttpOnly owner cookie.                                                                                                           |
| `DELETE /api/auth`                | Same origin                        | Clears the owner cookie.                                                                                                                                               |
| `GET /api/track/:reportId`        | `X-Reporter-Token`                 | Returns an allowlisted reporter view, excluding internal commands, review notes, routes, and other report IDs. Add `?mode=demo` for a demo report in the same session. |
| `POST /api/track/:reportId`       | Same capability and same origin    | Records a reproduction or release answer.                                                                                                                              |
| `POST /api/bugs/:bugId/actions`   | Live owner cookie, same origin     | Records permitted engineering evidence, reviews, clean quarantine facts, or severity. Sensitive reviews must arrive as verified GitHub human reviews.                  |
| `POST /api/demo/reset`            | Demo session, same origin          | Restores the seeded demo. Forbidden in live mode.                                                                                                                      |
| `POST /api/bugs/:bugId/demo-step` | Demo session, same origin          | Advances one explicitly simulated lifecycle step. Forbidden in live mode.                                                                                              |
| `GET /api/export`                 | Workspace session                  | Downloads the current authorized workspace as JSON.                                                                                                                    |

| Endpoint                           | Caller                                 | Behavior                                                                                                                                             |
| ---------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/track/:reportId/triage` | Report capability (`x-reporter-token`) | Returns advisory AI triage. Once a bug has triage, calls return the stored result with `reused: true` at no cost. Add `?mode=demo` for demo reports. |
| `GET /api/ai/usage`                | Live owner                             | Returns recorded model spend, the cap, and token totals, including cached tokens.                                                                    |

Triage returns 409 for a quarantined report, 429 at an hourly limit, and 503 when the model is unavailable, unconfigured, or the spending cap is reached. In each case the report stays saved. Billing figures never reach the reporter.

An owner browser may also use `POST /api/reports` for its current live workspace. Public pages use `/api/intake` explicitly; the demo form always supplies `mode=demo` even when the browser has an owner cookie.

### Report shape

```json
{
  "title": "Receipt preview stays blank",
  "description": "Complete checkout and open the receipt. The preview is blank.",
  "expected": "The receipt should show the purchased items.",
  "environment": "Chrome on desktop",
  "steps": ["Complete checkout", "Open receipt preview"]
}
```

`title` accepts 1–100 characters, `description` 1–6000, `expected` up to 300, `environment` up to 160, and `steps` up to eight nonempty items of at most 200 characters. Only title and description are required. Intake returns `reportId`, `clusterId`, `trackingToken`, `mode`, and `quarantined`. The token is shown once; storage retains its hash.

### Reporter answer shape

```json
{
  "phase": "release",
  "confirmed": false,
  "evidence": "The same steps still show a blank receipt."
}
```

`phase` is `reproduction` or `release`. The ledger checks the original reporter and the current state. A valid token cannot bypass those state guards.

## Worker endpoints

All use `POST` with `Authorization: Bearer WORKER_TOKEN`. These credentials stay on the server and AWS worker.

| Path                              | Behavior                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/api/worker/heartbeat`           | Records connected room count and worker version.                                                                 |
| `/api/worker/reports`             | Accepts authenticated Switch intake with native reporter/room/thread identity and delivery deduplication.        |
| `/api/worker/answers`             | Records an identity-checked native reporter confirmation.                                                        |
| `/api/worker/bugs/:bugId/actions` | Accepts allowlisted engineering commands. Cannot approve, merge, deploy, release quarantine, or change severity. |
| `/api/worker/bugs/:bugId/issue`   | Creates or reuses a sanitized GitHub issue.                                                                      |
| `/api/worker/outbox`              | Claims due jobs with temporary lease IDs.                                                                        |
| `/api/worker/outbox/:jobId`       | Acknowledges a matching lease with `success` and optional error category.                                        |

Source: [worker API](../../src/lib/api.ts), [outbox](../../src/lib/domain/outbox.ts), [native identity checks](../../worker/src/r2r_worker/boundary.py). The bearer authenticates the service; the worker separately checks Switch sender identity and room boundaries before forwarding a command.

## Engineering endpoints

These use the separate `Authorization: Bearer ENGINEERING_TOKEN`. The concierge bearer cannot access them. Responses omit reporter identities, private capabilities, routing information and raw input hashes.

| Method and path                             | Behavior                                                                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/engineering/heartbeat`           | Records provider, model, version and 0–4 connected role rooms. The server supplies the timestamp; unknown fields are rejected.                                 |
| `GET /api/engineering/work?after=:bugId`    | Up to 100 actionable sanitized clusters in ID order, with `nextCursor` for the next page. Includes reproduction and confirmation status needed to resume work. |
| `POST /api/engineering/bugs/:bugId/actions` | Only `start_reproduction`, `propose_reproduction`, `start_fix`, and `submit_fix`. Existing lifecycle guards still apply.                                       |
| `POST /api/engineering/bugs/:bugId/notes`   | A bounded operational audit note, with JSON `{ "summary": "..." }`.                                                                                            |

Engineering cannot answer a reporter, approve or merge a fix, record a deployment, release quarantine, or claim concierge deliveries. Sources: [engineering dispatcher](../../src/lib/engineering.ts), [boundary tests](../../tests/engineering.test.ts).

The authenticated workspace marks engineering connected only while its last heartbeat is less than 90 seconds old and all four role connections are open. This measures service and room liveness; model calls may still fail or reach their budget, with outcomes recorded on each bug. Demonstration workspaces do not expose live engineering metadata.

## GitHub webhook

`POST /api/webhooks/github` requires `X-Hub-Signature-256`, `X-GitHub-Event`, and `X-GitHub-Delivery`. Configure the repository's webhook for `pull_request`, `pull_request_review`, and `deployment_status`, with the same private webhook secret.

The relay verifies the raw-body HMAC and repository allowlist before interpreting the event. Delivery IDs prevent replay. Pushes clear prior approvals. Dismissed reviews stop counting. Merge heads must match the reviewed head. Sensitive approvals count distinct verified GitHub humans, not a shared dashboard key plus a GitHub login.

Successful production deployments are retained in the ledger. If a deployment arrives before its merge, a later merge reconciles it, including GitHub commit-ancestry checks when the deployed commit is newer. Preview deployments never notify reporters. Source: [GitHub relay](../../src/lib/integrations/github.ts), [boundary regressions](../../tests/release-boundaries.test.ts).

## Status codes

| Code          | Meaning                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `200` / `201` | Accepted read/action or created report.                                                                            |
| `400` / `415` | Invalid input or content type.                                                                                     |
| `401` / `403` | Invalid service/key/signature, missing authority, capability failure, or origin mismatch.                          |
| `404`         | Required internal report or bug does not exist. Public tracking deliberately returns a generic capability failure. |
| `409`         | Workflow prerequisite, duplicate report, or outbox lease conflict.                                                 |
| `413`         | Body exceeds its size limit.                                                                                       |
| `429`         | Intake or sign-in rate limit.                                                                                      |
| `502` / `503` | External API failure, unavailable configuration, or contention after retries.                                      |
