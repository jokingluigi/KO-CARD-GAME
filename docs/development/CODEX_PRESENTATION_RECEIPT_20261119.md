# Codex receipt: Claude presentation handoff

Received the user-provided [Claude handoff](./HANDOFF-claude-presentation-20261119.md). Reported claims and independently checked facts are distinguished below.

## Independently verified

- Remote `production` and `claude/battle-impact-vfx` point to `e5ea2170e2567df2ad9f1cb9e62d81fa4314da15`.
- Diff from `ee324cc644526ccb915c2fb5cc2e1d821e3f183b` contains presentation components/CSS/audio and 40 hs-mixes files. No differences in `src/game/**`, `lib/**`, API server or deployment scripts.
- Merged the presentation commit into the Codex handoff branch, retaining the newer verification and sprite documentation commits. No merge conflict; unrelated local QA files retained.
- Workspace typecheck and frontend build pass. Selected new presentation/audio/sprite tests and the November 18 card/champion/finisher regressions: 143 pass, zero failures/skips in this selected run.
- All 40 local hs-mixes files match the recorded SHA-256 values. This does not independently establish every licensing claim in the supplied manifest.
- Render frontend reports live deploy `dep-dbuttujl550s73blg0f0` at the exact e5ea2170 commit, branch production, autoDeploy no. Its actual build command uses APPROVED_PRODUCTION_COMMIT.

## Deployment contract — do not overwrite the new gate

Frontend now requires the environment approval variable to equal RENDER_GIT_COMMIT. The old `scripts/deploy/release.mjs front ...` helper still calls `productionSettings()` with a hardcoded SHA gate. **Do not use that old frontend flow as-is**, because it would replace the owner's new build command. This receipt did not change service settings, approval variables or trigger a deploy. A future frontend release must preserve the environment-based gate and account for the handoff's report that updating the approval variable can trigger deployment; inspect current queue/live state before creating another deploy.

The API service was not redeployed in this receipt. Receiving/merging the handoff is not an instruction to deploy again.

## Remaining limits and follow-ups

- Claude reports visual checks used local practice fixtures and lacked actual champion sprite data. Our sprite unit tests do not substitute for a live sprite visual review.
- Claude reports existing action-history/battle-event-caption and draft-bounce failures. Those suites were not included in this selected run; they remain reported outstanding issues, not newly fixed or independently reconfirmed baseline comparisons.
- Claude reports the `claude_readonly` role password was shared in chat. No password is present in this attachment. Credential exposure/remediation was not independently verified or executed here. Do not copy a disclosed password into source or this record. Rotation/role retirement should use the database owner's secure administration flow; deleting or locking a role is not implied by importing this handoff.
- The historical VFX cancellation applies to the earlier retired library. The currently handed-off presentation pass is preserved; setup/sprite documentation was updated to avoid treating the earlier cancellation as an instruction to delete this newer work.
