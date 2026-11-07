# Documentation

Reporter-to-Release is Team Vulcan's web-first bug desk. The public site is [reporter-to-release.pallabdas.me](https://reporter-to-release.pallabdas.me/). The live intake, durable ledger, private tracking, GitHub issue relay, and two-room Switch worker are deployed. Telegram and Slack are deferred. Engineering provider runtimes still need authentication in Switch Console.

- [User guide](user-guide.md): report a bug, explore the isolated demo, and operate the live desk.
- [Architecture](ARCHITECTURE.md): boundaries, lifecycle, persistence, and deployment diagrams.
- [Configuration](CONFIGURATION.md): environment variables and credential handling.
- [API](api/README.md): public, owner, worker, and GitHub endpoints.
- [Deployment and operations](operations/deployment.md): local setup, AWS, Vercel, DNS, recovery, and shutdown.
- [Threat model](security/threat-model.md): protected assets, authority checks, and remaining risks.
- [Test plan](testing/test-plan.md): automated coverage and the distinction between simulated and live evidence.
- [Design](DESIGN.md): visual tokens, responsive layouts, and accessibility.
- [Troubleshooting](TROUBLESHOOTING.md): common setup and delivery failures.
- [Event contribution and provenance](EVENT_CONTRIBUTION.md): new implementation, reused research, and actual commit history.
- [Glossary](glossary.md): terms used by the desk.
- [Build plan](BUILD_PLAN.md): the implementation plan recorded at the start of this repository.

The [third-party notices](../THIRD_PARTY_NOTICES.md) record source attribution and dependency licenses. No project license has been selected.
