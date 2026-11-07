# Verified production recorder

`.github/workflows/production.yml` runs after **Verify application** completes successfully for a push to this repository's `main`. Both the workflow and script reject PR runs, forks, other branches and incomplete or failed checks. Checkout uses the completed run's full `head_sha`.

Configure the repository Actions secret `VERCEL_TOKEN` with read access to project `prj_p7VIwQcUZo3uHYZeizYiFB4tqKgZ` in team `team_9DmQgMjE796WaejfWWU17kYK`. The job's `GITHUB_TOKEN` has `contents: read` and `deployments: write`. Credentials are provided only to the recorder step; health requests receive neither token.

The recorder polls Vercel for up to ten minutes. It independently checks the deployment's full SHA, project, team, production target and `READY` state. Its immutable `*.vercel.app` HTTPS URL and `https://reporter-to-release.pallabdas.me` must both return HTTP 200 from `/api/health` with `service: Reporter-to-Release`, `status: ok` and `storage: postgres`. Vercel's alias API must bind the custom hostname to that exact deployment before and after health checks. Redirects are rejected. All evidence checks repeat immediately before publishing success.

Only verified evidence creates a GitHub production deployment with task `verify:vercel-production`, followed by a `success` deployment status. The payload records the Vercel deployment/project/team and immutable URL. The status links to the custom hostname. This script only reads Vercel; deployments continue through the existing Vercel release process. Check success alone never records a production release.

Keep the repository's GitHub webhook subscribed to **Deployment statuses**, using the existing webhook secret and `/api/webhooks/github` endpoint. GitHub signs that external webhook; the recorder does not synthesize a webhook or read its secret. After setup, verify a real successful Actions run, its production deployment status, and the webhook's successful delivery. A passing local test suite does not establish that live delivery occurred.

Rerunning the successful verification workflow retriggers the recorder. A matching full-SHA/task/Vercel deployment record is reused; an already successful latest status is not posted again. A failed status write can resume without creating another deployment. The workflow serializes recorders, and lookup pagination and every network request have bounds. Failed or superseded releases remain unrecorded; inspect the workflow's fixed, credential-free error message and rerun after correcting the deployment, alias, health or API access.

Verification commands:

```sh
npm test -- tests/production-release.test.ts
npx eslint scripts/production-release.ts tests/production-release.test.ts
```

API contracts: [Vercel OpenAPI](https://openapi.vercel.sh/) (`getDeployments`, `getDeployment`, `getAlias`) and [GitHub deployments](https://docs.github.com/en/rest/deployments/deployments).
