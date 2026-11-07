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
- The responsive operator dashboard, public intake/tracker, and ShopLite's executable seeded coupon regression.
- New application/worker/browser tests, CI, production deployment, Namecheap DNS/TLS setup, screenshots, and final documentation.

Sources: [build plan](BUILD_PLAN.md), [source](../src), [worker adapter](../worker/src/r2r_worker), [scripts](../scripts), and the actual Git history.

## Commit record

These are actual repository commit timestamps in UTC. The first checkpoint contains setup and the build plan, not the completed application. Work was committed incrementally; no dates or authors were backdated to imply earlier event activity.

| Commit    | UTC, November 7, 2026 | Checkpoint                                                                         |
| --------- | --------------------- | ---------------------------------------------------------------------------------- |
| `c8cb769` | 10:33:46              | Application architecture and foundation, eight setup files.                        |
| `d79d392` | 10:44:02              | Guarded domain lifecycle and durable delivery ledger.                              |
| `f1706e7` | 10:54:39              | Authenticated APIs, project worker, and the initial draft README.                  |
| `e8a89ae` | 11:09:12              | Responsive dashboard and public reporter interface.                                |
| `fd4c961` | 11:28:48              | AWS/Switch setup and removal of the draft README.                                  |
| `e28e764` | 11:57:40              | Review fixes, acceptance tests, CI, dependency audit, and reproducible host setup. |

The later verification and final documentation checkpoints are visible in [the repository history](https://github.com/PDGamerSG/Reporter-to-Release/commits/main). Reproduce the full record with `git log --reverse --format='%h %cI %s'`. Commit spacing reflects actual elapsed work and is not proof of a feature's original authorship; the baseline table above records reuse explicitly.

## What has and has not been demonstrated

The web intake, Postgres persistence, private tracking, GitHub issue creation, owned Switch room handoff, AWS worker heartbeat, and signed GitHub webhook connection were exercised live on November 7. [Issue #1](https://github.com/PDGamerSG/Reporter-to-Release/issues/1) is explicitly a deployment acceptance report.

The entire merge/deploy/reporter verification/reopen sequence passes isolated API tests. The UI demo simulates that sequence in private visitor workspaces. The seeded coupon defect also has an actual failing and passing command. These are distinct evidence types, described in the [test plan](testing/test-plan.md).

Telegram and Slack were deferred in favor of web intake. Engineering model-provider runtimes are not authenticated. No live autonomous model-written fix, real fix pull request, human merge, or reporter-confirmed production fix is claimed. Future demonstrations should link their actual issues, PRs, reviews, deployments, and reporter evidence without relabeling the current synthetic examples.
