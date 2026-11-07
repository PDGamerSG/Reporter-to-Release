# Event contribution and provenance

This repository implements Team Vulcan's Reporter-to-Release entry for Flip the Switch, November 4–7, 2026. The implementation commits in this repository began on **November 7, 2026**. The design and generic Switch client existed in earlier repositories. They are baseline work, not new event contributions.

## Baseline sources

| Source                                                                                                    | Revision inspected                         | What was reused                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Hydra-Of-Malice/reporter-to-release](https://github.com/Hydra-Of-Malice/reporter-to-release)             | `87e96ca2c5c050076ca45393d6a8bcbfa58045a8` | Project concept, prior-art research, workflow requirements, and planning. The earlier repo described itself as planning.                               |
| [Hydra-Of-Malice/switch-hackathon-research](https://github.com/Hydra-Of-Malice/switch-hackathon-research) | `7458181d0f53987becc415f1bbf89ef876c78d34` | Generic Python Switch protocol client from `prototypes/s2-switchkit/src/switchkit`. Its earlier history includes commit `3e1d36e` on October 28, 2026. |
| [sandbox-quantum/switch](https://github.com/sandbox-quantum/switch)                                       | `f3f38eb54c6be0cec6f235d805e971efd15d9564` | External Switch runtime, official standalone compose contract, protocol, and template schema.                                                          |
| [PDGamerSG/Readme-pro-max](https://github.com/PDGamerSG/Readme-pro-max)                                   | `7981654ef073e7973961627249b5ea0ca6f0d47e` | README structure, documentation checklist, and checker used for the final documentation.                                                               |

The imported client lives under [worker/src/switchkit](../worker/src/switchkit). `__init__.py`, `client.py`, and `events.py` match the inspected research source. `connection.py` adds an `is_connected` property for the new worker heartbeat; its underlying connection implementation is reused. Earlier research benchmarks, vendor trials, and prototype results are not copied into this repo's test results or counted as event validation.

## New implementation in this repository

- The TypeScript domain engine: structured intake, deterministic redaction/quarantine, duplicate clusters, original-reporter confirmation, sensitive human review, release verification, reopening, and the durable outbox.
- The versioned Postgres ledger and concurrency handling; local development file fallback and independent demo workspaces.
- The authenticated Next.js API, private reporter-capability tracking, signed GitHub relay, reviewed-head checks, review dismissal, and out-of-order deployment reconciliation.
- The project-specific Python concierge worker, persistence receipts, engineering sender boundary, Switch room bootstrap, AWS deployment scripts, and web report-to-issue/dossier delivery.
- The restricted engineering API and AWS manager/reproducer/fixer/advisory-review runtime, receipt-bound native handoffs, networkless regression containers, durable model budgets and exact-patch draft PR publisher.
- The trusted-main Vercel production recorder, checking full commit SHA, project, alias and health before GitHub deployment evidence is published.
- The responsive operator dashboard, public intake/tracker, and ShopLite's executable seeded coupon regression.
- New application/worker/browser tests, CI, production deployment, Namecheap DNS/TLS setup, screenshots, and final documentation.

Sources: [build plan](BUILD_PLAN.md), [source](../src), [worker adapter](../worker/src/r2r_worker), [scripts](../scripts), and the actual Git history.

## Commit record

These are the original commit IDs and actual repository commit timestamps in UTC, captured before the later history change described below. The first checkpoint contains setup and the build plan, not the completed application. Work was committed incrementally; no dates or authors were backdated to imply earlier event activity.

| Commit    | UTC, November 7, 2026 | Checkpoint                                                                                 |
| --------- | --------------------- | ------------------------------------------------------------------------------------------ |
| `c8cb769` | 10:33:46              | Application architecture and foundation, eight setup files.                                |
| `d79d392` | 10:44:02              | Guarded domain lifecycle and durable delivery ledger.                                      |
| `f1706e7` | 10:54:39              | Authenticated APIs, project worker, and the initial draft README.                          |
| `e8a89ae` | 11:09:12              | Responsive dashboard and public reporter interface.                                        |
| `fd4c961` | 11:28:48              | AWS/Switch setup and removal of the draft README.                                          |
| `e28e764` | 11:57:40              | Review fixes, acceptance tests, CI, dependency audit, and reproducible host setup.         |
| `5a7f378` | 12:07:53              | Initial live documentation, screenshots and explicit baseline attribution.                 |
| `af74b36` | 12:58:50              | Original frontend branch: one-page home and cached advisory AI triage.                     |
| `6c022eb` | 13:01:51              | Original frontend branch: conservative accounting for uncertain model calls.               |
| `de56503` | 13:03:29              | Concurrent frontend contribution: one-page home and cached advisory AI triage, PR #2.      |
| `7751be8` | 13:04:05              | Separate restricted engineering API.                                                       |
| `bafc466` | 13:18:21              | Production recorder and merge preserving the frontend contribution.                        |
| `f0557ce` | 13:35:47              | Isolated AWS engineering stages and persistent execution receipts.                         |
| `e1c3718` | 13:58:06              | Native Switch receipt authentication, transport binding and patch quality gates.           |
| `ca745f1` | 14:19:49              | Backend guide and actual controlled acceptance evidence.                                   |
| `4eda547` | 14:55:34              | Merge of the original frontend branch ancestry into main; no source-tree change.           |
| `73cb2ec` | 15:05:42              | Restricted engineering heartbeat API and measured connection freshness contract.           |
| `4476dfc` | 15:16:05              | Live AWS heartbeat publishing, accurate frontend crew/connections, and browser acceptance. |
| `28113c1` | 15:26:51              | Combined release documentation, measured evidence and original frontend screenshots.       |
| `98298f7` | 15:37:39              | Owner-approved PR #4 merge, preserving the exact reviewed head and tested combined tree.   |

Commit IDs in this table are the current history. [The commit ID map](evidence/commit-id-map.md) links them to the IDs recorded in earlier evidence.

The final documentation checkpoint is visible in [the repository history](https://github.com/PDGamerSG/Reporter-to-Release/commits/main). Inspect the currently published record with `git log --reverse --format='%h %cI %s'`. The frontend contribution and restricted API were developed concurrently and retain their actual nearby timestamps. PR #2 squashed the two original frontend commits into `c508b5e`; merge `9a1f241` later retained their original ancestry without counting that code twice. New integration checkpoints keep at least ten minutes of actual elapsed time. No placeholder commits or rewritten timestamps were used. Commit spacing is not proof of original authorship; the baseline table above records reuse explicitly.

While preparing completion documentation, the local checkout and published `main` were independently rewritten outside this release operation. The observed merge changed from `d81ba99` to `3970b80`, with the same tree `6a991efb82145ba1dd8c81a0a943143b948c1e17` and timestamp. Its fix parent changed from `496f9aa` to `45624dc`, also with an identical tree. Original commit IDs, including the frontend branch IDs, are no longer ancestors of published `main`; the table and earlier evidence retain the IDs actually observed at release time. GitHub PR #4 still records the exact original approved head and merge. [Completion evidence](evidence/2026-11-07-controlled-release.json) records this observation separately. This operation did not perform or reverse that history rewrite.

## What has and has not been demonstrated

The web intake, Postgres persistence, private tracking, GitHub issue creation, owned Switch room handoff, AWS worker heartbeat, and signed GitHub webhook connection were exercised live on November 7. [Issue #1](https://github.com/PDGamerSG/Reporter-to-Release/issues/1) is explicitly a deployment acceptance report.

The entire merge/deploy/reporter verification/reopen sequence passes isolated API tests. The UI demo simulates that sequence in private visitor workspaces. The seeded coupon defect also has an actual failing and passing command. These are distinct evidence types, described in the [test plan](testing/test-plan.md).

Telegram and Slack were deferred in favor of web intake. The AWS engineering service now uses the existing Meta provider credential. A real model-generated failing regression for the separate controlled overflow report was measured and reviewed on November 7. After original-reporter confirmation, the service produced [draft PR #4](https://github.com/PDGamerSG/Reporter-to-Release/pull/4) at 14:09:29 UTC, head `496f9aa`, with 113 passing unit tests and independent CI. [Backend evidence](evidence/2026-11-07-backend-acceptance.json) preserves those revisions and measured results.

The owner subsequently instructed, "Approve this exact fix and merge it." That explicit approval was recorded at 15:33:48 UTC for the unchanged full PR head. PR #4 merged as `d81ba99` at 15:37:39 UTC; combined CI passed 124 TypeScript tests, 21 Python unit tests, three Docker integration tests and 18 browser scenarios. The production recorder verified that exact revision, and its signed deployment webhook returned HTTP 200 at 15:39:19 UTC. After independently checking the calculation module from the verified production source, the original controlled acceptance runner confirmed release through its original private capability at 15:45:13 UTC. The live ledger is `verified`. This remains a controlled acceptance, not a customer incident. [Completion evidence](evidence/2026-11-07-controlled-release.json) separates owner consent, advisory review, actual release and the automated reporter check.
