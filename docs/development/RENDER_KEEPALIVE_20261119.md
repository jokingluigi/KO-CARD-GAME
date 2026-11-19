# Free Render API keep-alive

The owner authorized periodic requests for the single free Render API service, without another account or a paid upgrade. The initial GitHub scheduler below did not establish automatic execution. It is being replaced by the existing-database monitor documented in [RENDER_DB_KEEPALIVE.md](RENDER_DB_KEEPALIVE.md).

- Original workflow: https://github.com/jokingluigi/KO-CARD-GAME/actions/workflows/render-keepalive.yml
- Default branch: `main`. Activation commit: `5d18e09920360d07fec20ad3e549735c14fa1dc5`; its only change was the new workflow file. No application branch merge or Render deployment was performed.
- Schedule: `2-59/5 * * * *` (every five minutes, offset from the top of the hour).
- Endpoint: `https://ko-card-game.onrender.com/api/healthz`, with a cache-busting query and `Cache-Control: no-cache`.
- GitHub token permissions: none. No checkout, secrets, external account or repository writes from the job.
- Four-minute job timeout, bounded network timeouts/retries and serialized concurrent runs.

Validation: workflow YAML and Bash syntax validated locally; the exact curl script returned HTTP 200 from the live API. Initial GitHub manual run `44453795210` completed successfully, including the health-request step: https://github.com/jokingluigi/KO-CARD-GAME/actions/runs/44453795210 . Workflow state is active. GitHub runner log download was unavailable to the current integration, so execution success was verified through the job and step conclusions.

Operational limits: GitHub cron is best-effort and may be delayed; this is not a guaranteed always-on service or a replacement for paid hosting. GitHub may disable scheduled workflows in public repositories after 60 days without repository activity. Enable it again in Actions if that occurs. Keep the workflow on the default branch; a copy is retained on the handoff branch for future merges. Do not merge old application code from main into production merely to install this workflow.

## Follow-up: GitHub recurring execution was not established

At 2026-11-19 05:11 UTC the workflow still had zero `schedule` runs; at 08:32 UTC it still only had the original manual success. The original manual check did not verify keep-alive operation. Cron was simplified to `*/5 * * * *` on main (`7fb3ad3`) and the workflow disabled/re-enabled at 05:13:52 UTC, but automatic execution remained unconfirmed. Do not report this GitHub monitor as verified continuous protection.

Warm-server diagnostic requests at 05:15 UTC returned HTTP 200: health 402 ms, cards 385 ms, login 573 ms, session 300 ms. The temporary diagnostic login was logged out. No credentials were logged. The user has no UptimeRobot account and does not want account signup to be a prerequisite. Investigate the existing database scheduler via a fixed-purpose administrator operation instead; direct database network access from the execution workspace is unavailable.

## Replacement: existing Supabase scheduler

API-only source `ba7ca739265df9e08aa85d7f3a5afa82ca98f1a8` deployed live as `dep-dbvbeamtlv9c738cuh20` on 2026-11-19 08:47 UTC. The current production source includes Claude's `099d1f8` presentation work; the frontend service and its deployment settings were not changed.

The ADMIN-only fixed-purpose monitor reported both extensions available but not installed. Configuration succeeded with pg_cron 1.6.4 and pg_net 0.20.4. Job 1, `ko-card-game-render-keepalive-v1`, was registered active with `*/5 * * * *`. No new account, Render service, paid upgrade, player/card data update, or credential disclosure was required. Unauthenticated access returned 401, and a request containing an external URL was rejected with 400.

Local verification: five operational unit tests passed, API typecheck passed, API production build passed. Public health revision matched the deployed SHA. Scheduled HTTP results follow below; registration by itself is not success evidence.

**Actual automatic execution verified:** cron job 1 ran successfully from `2026-11-19T08:50:00.121Z` to `08:50:00.149Z`. Its outbound pg_net request 1 returned HTTP **200**, with `timed_out=false` and `failed=false`, observed at `08:50:04.643Z`. This request came from the registered cron command, not a manual health check. The failed GitHub scheduler was then disabled manually to avoid maintaining two monitors. The DB job remains active at five-minute intervals. Monitoring still depends on both hosting providers; do not promise guaranteed uptime or immediate login under all conditions.
