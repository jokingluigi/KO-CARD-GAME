# Existing-database API monitor

The GitHub Actions workflow was active but had zero scheduled runs on 2026-11-19, even after cron re-registration. A successful manual run did not prove ongoing monitoring.

This replacement uses the existing Supabase project's `pg_cron` and `pg_net` extensions. It requires no additional monitoring account or Render service. It does not upgrade either plan. It adds workload to the existing services; it is not a guarantee of free-tier availability or uninterrupted hosting.

## Operation

Authenticated ADMIN sessions can GET `/api/admin/server-keepalive` for extension availability, the named job, recent cron runs, and the last ten outbound request statuses. POST accepts **only** `{ "enabled": true }` or `{ "enabled": false }`. Other keys are rejected. No arbitrary URL, SQL, schedule, or credentials are accepted.

Enabling installs the two extensions if available and permitted, creates the private `ko_render_keepalive.requests` audit table, and registers the one job `ko-card-game-render-keepalive-v1`. It calls only `https://ko-card-game.onrender.com/api/healthz` every five minutes (288 small GETs per day), with no authentication or player data. Configuration uses a transaction and advisory lock. Re-enabling updates the same named job; disabling unschedules only that job owned by the connected DB role. It never drops shared extensions or changes game tables.

Request IDs and timestamps are retained for one day; this job's cron run history is retained for seven days. HTTP response data stays in pg_net's own transient table. API status exposes response codes, timeout/error flags, and timestamps, never response bodies or other cron jobs.

## Verification

Check `requests[].status_code === 200` for requests emitted by cron, as well as cron run status. Merely saving a job, or a manual GET to healthz, does not establish that the scheduler ran. A null HTTP code immediately after a tick can mean pg_net has not completed its asynchronous request yet.

The monitor depends on Supabase and Render availability and can stop if the DB project is paused. It does not fix client networking, authentication bugs, or every cause of login delay. Inspect actual login latency separately.

Validation: `node --test scripts/deploy/render-keepalive.test.mjs`, API typecheck and build. Do not deploy the frontend for this operational change or overwrite Claude's deployment gate. Live activation evidence is recorded separately in the keep-alive incident notes.
