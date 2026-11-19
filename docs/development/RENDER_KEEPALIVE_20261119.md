# Free Render API keep-alive

The owner authorized enabling periodic requests for the single free Render API service. No UptimeRobot account is connected, so this uses the existing public GitHub repository's hosted scheduler without extra credentials or a paid plan.

- Active workflow: https://github.com/jokingluigi/KO-CARD-GAME/actions/workflows/render-keepalive.yml
- Default branch: `main`. Activation commit: `5d18e09920360d07fec20ad3e549735c14fa1dc5`; its only change was the new workflow file. No application branch merge or Render deployment was performed.
- Schedule: `2-59/5 * * * *` (every five minutes, offset from the top of the hour).
- Endpoint: `https://ko-card-game.onrender.com/api/healthz`, with a cache-busting query and `Cache-Control: no-cache`.
- GitHub token permissions: none. No checkout, secrets, external account or repository writes from the job.
- Four-minute job timeout, bounded network timeouts/retries and serialized concurrent runs.

Validation: workflow YAML and Bash syntax validated locally; the exact curl script returned HTTP 200 from the live API. Initial GitHub manual run `44453795210` completed successfully, including the health-request step: https://github.com/jokingluigi/KO-CARD-GAME/actions/runs/44453795210 . Workflow state is active. GitHub runner log download was unavailable to the current integration, so execution success was verified through the job and step conclusions.

Operational limits: GitHub cron is best-effort and may be delayed; this is not a guaranteed always-on service or a replacement for paid hosting. GitHub may disable scheduled workflows in public repositories after 60 days without repository activity. Enable it again in Actions if that occurs. Keep the workflow on the default branch; a copy is retained on the handoff branch for future merges. Do not merge old application code from main into production merely to install this workflow.
