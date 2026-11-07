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
