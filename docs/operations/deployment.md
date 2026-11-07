# Deployment and operations

## Current topology

| Service                  | Deployment                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Web UI and API           | [reporter-to-release.pallabdas.me](https://reporter-to-release.pallabdas.me/), Vercel project `reporter-to-release` |
| Application ledger       | Neon Postgres, initialized with `migrations/001_ledger.sql`                                                         |
| Switch API               | [r2r-switch.pallabdas.me](https://r2r-switch.pallabdas.me/health), Caddy HTTPS proxy on AWS                         |
| Worker / Switch database | EC2 `i-054399bd412a466f6`, `ap-southeast-2`, t3.small with an encrypted 24 GiB volume                               |
| DNS                      | Namecheap: app CNAME to Vercel's project-specific target; Switch A record to the owned Elastic IP                   |

The host is managed through AWS Systems Manager, using the `ReporterToReleaseSSM` instance profile. Its security group allows public 80/443 only. SSH and database ingress are closed. EC2, storage, and the public IPv4 allocation incur charges while retained.

Sources: [host setup](../../scripts/setup-switch-host.sh), [worker deployment](../../scripts/deploy-worker.py), [compose](../../infra/worker.compose.yml).

## Run locally

Use Node 22 or newer, npm, and optionally Python 3.12+ with uv for the worker.

```bash
npm ci
npm run setup
npm run dev
```

Open `http://127.0.0.1:3000`. Without a database URL, a single-process file ledger supports the demo and local live desk. The setup script preserves existing private configuration. See [configuration](../CONFIGURATION.md) before enabling GitHub or a production database.

## Recreate the AWS host

1. Create an Amazon Linux 2023 x86_64 EC2 instance, encrypted storage, a security group exposing only TCP 80/443, and an instance profile with `AmazonSSMManagedInstanceCore`. Require IMDSv2. No SSH key or public SSH ingress is needed.
2. Allocate and associate an Elastic IP. Add the chosen Switch hostname's A record in Namecheap. Preserve unrelated DNS records.
3. Through an SSM session, copy and run [setup-switch-host.sh](../../scripts/setup-switch-host.sh) as root. Set `R2R_SWITCH_HOST` and `R2R_ADMIN_EMAIL` if using another hostname or admin identity. The script installs Docker, verifies pinned Compose/Buildx downloads, fetches the pinned official compose file, generates private credentials on the host, and starts Switch and Caddy.
4. Wait for the Switch health endpoint and the hostname's valid TLS certificate. The admin credentials remain in the host's private `.env`; never paste that file into logs.
5. From the configured application checkout, deploy the worker through SSM:

```bash
python3 scripts/deploy-worker.py \
  --instance-id i-054399bd412a466f6 \
  --region ap-southeast-2 \
  --app-url https://reporter-to-release.pallabdas.me
```

The script returns an SSM command ID. Inspect that command's status before assuming deployment succeeded. It packages only the required worker files, sends configuration through a private temporary request file, registers owned identities and rooms, and builds the worker. Its bootstrap preserves previously registered credentials. It does not install or sign in to model-provider runtimes.

Switch is pinned to upstream source [`f3f38eb54c6be0cec6f235d805e971efd15d9564`](https://github.com/sandbox-quantum/switch/tree/f3f38eb54c6be0cec6f235d805e971efd15d9564), image `ghcr.io/sandbox-quantum/dev/switch-core:0.31.1-dev.382.gf3f38eb`. The worker base image is pinned by digest. Caddy and Postgres use their upstream major-version tags and should be reviewed when deliberately rebuilding the host.

## Deploy the application

1. Create a Vercel project linked to this repository and Neon Postgres. Set the production variables from [configuration](../CONFIGURATION.md).
2. With the private database configured, run `npm run db:init`. Do not use the local file ledger on serverless hosting.
3. Run the checks in the [test plan](../testing/test-plan.md). Deploy the intended commit on main using the linked GitHub integration or `vercel deploy --prod`.
4. Attach the custom domain to the explicit Vercel project. Read Vercel's project-specific DNS recommendation, save that CNAME in Namecheap, and preserve unrelated records. Verify domain ownership and TLS.
5. Compare the custom hostname's JavaScript/CSS assets with the intended immutable READY deployment. Use authenticated provider access if the immutable URL has deployment protection; keep that protection enabled.
6. Configure the signed GitHub webhook at `/api/webhooks/github` for pull requests, reviews, and deployment status. Check an actual delivery in GitHub's webhook history.

The configured application CNAME is `643431f77ce4190c.vercel-dns-017.com`. Treat provider recommendations as project-specific; another project may receive a different target. Source: [Next configuration](../../next.config.ts), [migration](../../migrations/001_ledger.sql), [GitHub relay](../../src/lib/integrations/github.ts).

### Record release evidence in GitHub

The linked Vercel integration builds main, but the observed deployment did not create a GitHub Deployment automatically. After verifying a READY release, record its exact commit using GitHub's [Create a deployment](https://docs.github.com/en/rest/deployments/deployments#create-a-deployment) API with `environment: production`, `auto_merge: false`, and the already-validated required contexts. Then [create a successful deployment status](https://docs.github.com/en/rest/deployments/statuses#create-a-deployment-status), setting `environment_url` to the verified HTTPS app and `log_url` to its immutable release. This causes GitHub to deliver the signed event consumed by the relay.

Do not record success before the release is READY and verified. A merge, passing CI run, or preview URL is insufficient. The first verified application release was recorded as deployment `7620917538` for `e28e764`; GitHub's signed status delivery returned 200. Future fix releases need this same evidence or an equivalent configured deployment integration before reporters receive a release update.

## Operate and recover

- Check `/api/health`, the live Connections page, worker heartbeat age, pending outbox attempts, GitHub delivery failures, EC2 status, and available disk space.
- Use SSM to inspect container status under `/opt/r2r`. Rebuild the worker using the checked-in deployment script. Preserve its `worker-state` directory, Switch credential file, and Docker database/certificate volumes.
- A web rollback uses Vercel's previous known-good deployment. Keep the database; the current optional deployment-history field is compatible with older ledger documents. Re-run checks after restoring a prior application version.
- Snapshot the encrypted EC2 volume and use the database provider's backup facilities according to your retention policy. A recovery is complete only after restoring data and checking intake, tracking, and an outbox delivery. A restore drill has not been performed for this deployment.
- Demo ledgers have expiry timestamps, but no recurring cleanup job is configured. An operator may remove expired demo rows with `DELETE FROM r2r_ledgers WHERE expires_at < now();`. The live ledger has no expiry.
- Rotate the owner key and redeploy when access changes. Rotate worker credentials on both the app and host together. Session-secret rotation signs everyone out and changes future pseudonymous identity hashes. Follow the pinned upstream Switch keyring process for its separate encryption keys.

## Connect engineering and chat later

Sign in to a supported provider through Switch Console before expecting manager/reproducer/fixer/reviewer execution. The [desk](../../templates/r2r-desk.template.yaml) and [fix-room](../../templates/r2r-fix-room.template.yaml) templates describe these roles; they are not automatically installed by the AWS bootstrap. Add each trusted runtime's agent ID to the worker allowlist and keep public reporters out of engineering rooms.

Telegram and Slack are explicitly deferred. Install their bridges through Switch Console later and verify native identity, addressing, and original-reporter confirmation before allowing real traffic.

## Shut down

Export authorized ledger data and take any required backups first. Stop the worker to stop delivery, then pause/remove the web deployment if appropriate. Terminating EC2 alone does not release its Elastic IP or every retained volume. Review EC2, EBS snapshots/volumes, Elastic IP, Neon, Vercel, DNS, and GitHub webhooks separately before deleting resources. Remove only records and resources created for this project.
