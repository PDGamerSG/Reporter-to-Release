# Troubleshooting

## The application cannot read its ledger

Run `npm run setup` and confirm the private `.env.local` exists. With no `DATABASE_URL`, local development writes `.data` files and must run as one Node process. Production requires Postgres. Run `npm run db:init` against the configured database before starting the production app. Check Vercel environment configuration and redeploy after changing it.

Sources: [store](../src/lib/store/index.ts), [migration script](../scripts/init-db.ts).

## A write says it must come from the same website

Use the same hostname and port in the browser and request origin. Browser requests must send JSON from the current origin. For manual HTTP requests, supply an `Origin` header matching the destination, such as `http://127.0.0.1:3000`. Do not disable the check to work around a proxy mismatch. The API uses the destination Host header because Next.js may normalize loopback request URLs.

Source: [HTTP boundary](../src/lib/http.ts).

## Owner sign-in fails

Use the `ADMIN_TOKEN` from the current private environment, not a GitHub or Switch token. A changed Vercel value requires a new deployment. The API limits sign-in attempts to 10 in 10 minutes for an identity bucket. Rotating `SESSION_SECRET` invalidates existing owner and demo cookies; sign in again.

Source: [authentication route](../src/lib/api.ts).

## A tracking link is rejected

Open the complete original link, including its `#` fragment. The fragment is supplied as `X-Reporter-Token` by the tracker and is not sent as part of the page URL. Demo tracking also needs the same browser's demo session. A report ID alone grants no access. Tokens cannot be recovered; do not paste them into issues or logs.

Sources: [tracker](../src/components/tracker.tsx), [tracking API](../src/lib/api.ts).

## Switch shows disconnected or outbox jobs remain pending

Check the worker container and its most recent heartbeat. The UI calls Switch connected only when the heartbeat is less than 90 seconds old and at least two rooms are connected. Confirm `APP_URL`, matching `WORKER_TOKEN`, agent credentials, room membership, and a writable persistent receipt path. Use SSM for host access; do not open port 22.

An unacknowledged job becomes available after its lease expires. Failed jobs retry with delay. Inspect error categories without printing environment variables. Keep the receipt volume when replacing the worker. Sources: [presentation](../src/lib/presentation.ts), [outbox](../src/lib/domain/outbox.ts), [worker](../worker/src/r2r_worker/main.py).

## The manager receives a dossier but no fix appears

The registered manager is a destination, not an authenticated model runtime. Sign in to the chosen provider in Switch Console, connect the runtime to the owned engineering room, and add its agent ID to the worker allowlist. The templates describe engineering roles but are not automatically instantiated by the AWS bootstrap.

Sources: [bootstrap](../scripts/bootstrap-switch.py), [templates](../templates/r2r-desk.template.yaml).

## GitHub accepts the webhook but the bug does not advance

Check the event's repository, PR number, reviewed head SHA, human approvals, and current ledger state. A push invalidates prior approvals. A merge alone does not send release notices. The relay waits for `deployment_status: success` in the `production` environment, with a commit equal to or descended from the merge. Vercel deployments must be associated with the configured GitHub repository to emit relevant GitHub evidence.

Successful production deployment evidence is retained even if its merge arrives later. Other missing prerequisites, such as a reviewed head or approval, can require reconciliation followed by redelivery of a failed event from GitHub's webhook settings. Never forge a production event to make the dashboard look finished. Source: [GitHub relay](../src/lib/integrations/github.ts).

## Docker worker builds fail on Amazon Linux

The host setup pins Docker Compose 2.40.3 and Buildx 0.29.1 with verified download checksums. The older Buildx supplied by the host package may be incompatible with Compose. Run the checked-in host setup or inspect the deployed plugin version. Source: [host setup](../scripts/setup-switch-host.sh).

## Browser tests cannot connect

Playwright expects an already-running server. Start `npm run dev -- --port 3107`, or build and use `npm run start -- --port 3107`, then run `npm run test:e2e`. Do not run a production build against the same `.next` directory while a development test run is in progress. Install Chromium with `npx playwright install chromium`.

CI starts its own production server and uses isolated configuration. The owner spec disables traces because traces can retain private form values and authenticated traffic. Source: [CI](../.github/workflows/ci.yml), [browser config](../playwright.config.ts), [owner test](../e2e/owner.spec.ts).
