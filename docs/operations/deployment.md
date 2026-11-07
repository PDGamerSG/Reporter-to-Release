# Deployment and operations

## Current topology

| Service                                   | Deployment                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Web UI and API                            | [reporter-to-release.pallabdas.me](https://reporter-to-release.pallabdas.me/), Vercel project `reporter-to-release` |
| Application ledger                        | Neon Postgres, initialized with `migrations/001_ledger.sql`                                                         |
| Switch API                                | [r2r-switch.pallabdas.me](https://r2r-switch.pallabdas.me/health), Caddy HTTPS proxy on AWS                         |
| Concierge / engineering / Switch database | EC2 `i-054399bd412a466f6`, `ap-southeast-2`, t3.small with an encrypted 24 GiB volume                               |
| DNS                                       | Namecheap: app CNAME to Vercel's project-specific target; Switch A record to the owned Elastic IP                   |

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

The script returns an SSM command ID. Inspect that command's status before assuming deployment succeeded. It packages only the required worker files, sends configuration through a private temporary request file, registers owned identities and rooms, and builds the worker. Its bootstrap preserves previously registered credentials. Deploy the separate engineering service using [its runbook](engineering-runtime.md); worker deployment alone does not start model execution.

Switch is pinned to upstream source [`f3f38eb54c6be0cec6f235d805e971efd15d9564`](https://github.com/sandbox-quantum/switch/tree/f3f38eb54c6be0cec6f235d805e971efd15d9564), image `ghcr.io/sandbox-quantum/dev/switch-core:0.31.1-dev.382.gf3f38eb`. The worker base image is pinned by digest. Caddy and Postgres use their upstream major-version tags and should be reviewed when deliberately rebuilding the host.

## Deploy the application

1. Create a Vercel project linked to this repository and Neon Postgres. Set the production variables from [configuration](../CONFIGURATION.md).
2. With the private database configured, run `npm run db:init`. Do not use the local file ledger on serverless hosting.
3. Run the checks in the [test plan](../testing/test-plan.md). Deploy the intended commit on main using the linked GitHub integration or `vercel deploy --prod`.
4. Attach the custom domain to the explicit Vercel project. Read Vercel's project-specific DNS recommendation, save that CNAME in Namecheap, and preserve unrelated records. Verify domain ownership and TLS.
5. Compare the custom hostname with the intended immutable READY deployment. The recorder needs public production health endpoints; the current project protects previews and leaves production publicly inspectable for judging.
6. Configure the signed GitHub webhook at `/api/webhooks/github` for pull requests, reviews, and deployment status. Check an actual delivery in GitHub's webhook history.

The configured application CNAME is `643431f77ce4190c.vercel-dns-017.com`. Treat provider recommendations as project-specific; another project may receive a different target. Source: [Next configuration](../../next.config.ts), [migration](../../migrations/001_ledger.sql), [GitHub relay](../../src/lib/integrations/github.ts).

### Automatic production evidence

The linked Vercel integration builds main. After **Verify application** succeeds for a trusted main push, [Record verified production](../../.github/workflows/production.yml) independently verifies the exact full SHA, Vercel project/team, production target, READY state, immutable health and custom-host alias. It then records a GitHub production deployment and success status. GitHub delivers the signed event consumed by the relay. Configure the Actions secret `VERCEL_TOKEN`; the job uses its restricted GitHub token for deployment writes. See [the recorder runbook](production-recorder.md) for checks, retry behavior and recovery.

The first release record for `e28e764` was manually verified. The automation was then exercised on `08126f0`: [recorder run 42376443123](https://github.com/PDGamerSG/Reporter-to-Release/actions/runs/42376443123) succeeded, created production deployment `7621744646`, and GitHub's signed webhook returned 200 at 13:25:23 UTC on November 7. This verifies an application release; it does not claim a customer bug was merged or resolved. Passing CI or a preview URL alone never records success.

## Operate and recover

- Check `/api/health`, the live Connections page, worker heartbeat age, pending outbox attempts, GitHub delivery failures, EC2 status, and available disk space.
- Use SSM to inspect container status under `/opt/r2r`. Rebuild services using the checked-in deployment scripts. Preserve `worker-state`, `engineering-state`, the Switch credential file, and Docker database/certificate volumes.
- A web rollback uses Vercel's previous known-good deployment. Keep the database; the current optional deployment-history field is compatible with older ledger documents. Re-run checks after restoring a prior application version.
- Snapshot the encrypted EC2 volume and use the database provider's backup facilities according to your retention policy. A recovery is complete only after restoring data and checking intake, tracking, and an outbox delivery. A restore drill has not been performed for this deployment.
- Demo ledgers have expiry timestamps, but no recurring cleanup job is configured. An operator may remove expired demo rows with `DELETE FROM r2r_ledgers WHERE expires_at < now();`. The live ledger has no expiry.
- Rotate the owner key and redeploy when access changes. Rotate worker credentials on both the app and host together. Session-secret rotation signs everyone out and changes future pseudonymous identity hashes. Follow the pinned upstream Switch keyring process for its separate encryption keys.

## Engineering and later chat connections

The active [AWS engineering service](engineering-runtime.md) runs manager, reproducer, fixer and advisory reviewer identities with the explicitly configured Meta provider. It creates private per-bug rooms and runs generated code in networkless containers. The templates remain reference descriptions; the runtime implements the bounded ShopLite flow directly. A native Bedrock adapter is available, but real-work calls were blocked by account quota. No provider-console sign-in is required for the active Meta API configuration.

Telegram and Slack are explicitly deferred. Install their bridges through Switch Console later and verify native identity, addressing, and original-reporter confirmation before allowing real traffic.

## Shut down

Export authorized ledger data and take any required backups first. Stop the worker to stop delivery, then pause/remove the web deployment if appropriate. Terminating EC2 alone does not release its Elastic IP or every retained volume. Review EC2, EBS snapshots/volumes, Elastic IP, Neon, Vercel, DNS, and GitHub webhooks separately before deleting resources. Remove only records and resources created for this project.
