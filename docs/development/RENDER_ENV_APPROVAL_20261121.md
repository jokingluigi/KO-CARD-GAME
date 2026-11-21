# Render release approval via environment variable

Both services use the same static build guard:

```
node -e "if(!process.env.APPROVED_PRODUCTION_COMMIT||process.env.RENDER_GIT_COMMIT!==process.env.APPROVED_PRODUCTION_COMMIT){console.error('UNAPPROVED PRODUCTION REVISION');process.exit(1)}"
```

`protectedBuildCommand(role, approvedCommit)` still validates the full immutable approval SHA but no longer embeds it in the shell command. `approveProductionRelease` writes that SHA to the one service environment variable via PUT, then applies the static service settings. `deploy` calls this only after validating the published production head, current live ancestry and absence of concurrent deploys, and before requesting a deploy. An environment update failure stops before changing the build command. Going live no longer reapplies settings, avoiding an overwrite of a subsequent approval.

No bulk environment replacement, credentials, or player/card DB writes. The existing live services were already using this guard; this change updates the repository tooling to agree with those settings. Changing this tooling does not require redeploying the application.

Validation: `node --test scripts/deploy/verify-release.test.mjs` — 11 passed, covering ancestry, commit mismatch, missing approval/revision, matching approval, both service roles, environment-write order and failure. The guards run before dependency installation or source-controlled scripts.

## Separate support findings

Attendance is currently a one-time ladder: `nextAttendanceDayIndex` increments past the last definition, and a unique `(user_id, day_index)` claim index prohibits repeating the same day. Automatic cyclic attendance would require a deliberate schema and claim-cycle change, not just changing the visible counter. No attendance payouts or claim history were changed.

The screenshot is an AI daily-quest replay failure. The match result reward is settled separately; the failed replay does not mark daily-quest progress as verified. A missing attacker in the server reconstruction produces the displayed error. This particular match has not been reproduced; broad local sample play found no corresponding client/core mismatch. Do not bypass action validation or grant progress from an unverified final client state. Champion/card details are requested to narrow the reproduction. No claim is made that this replay defect has been fixed.
