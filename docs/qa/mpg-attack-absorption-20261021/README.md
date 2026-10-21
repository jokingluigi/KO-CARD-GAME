# MPG actual attack absorption

The authenticated current MPG record (stable ID `5d568663-55e8-4ad9-88b3-3afadae538d0`, revision 5) and its reviewed binding both explicitly reduced the opponent by two and independently granted MPG three attack. The user corrected the rule to absorption: reduce by up to two, grant exactly that amount, never absorb from zero.

Replace the two independent effects with the existing `drainAttackAmount: 2` action. No generic engine, targeting, costs, base stats, other cards, schema, account or reward changes. The corrected literal wording and exact previous wording both resolve to this reviewed binding; unrelated future wording and explicitly authored effects still do not inherit it. Older historical MPG wording is untouched.

Executed locally:

- Actual engine hand-play/target selection with both current and corrected descriptions at target attack 0/1/2/5: PASS; target decreases by min(2, attack), MPG gains exactly that amount, unrelated ally unchanged, no stuck targeting and next turn remains usable.
- No opponent wrestler: no attack granted, turn remains usable.
- Reviewed administrator effects regression suite: **308 passed, zero failed/skipped**, including existing Thief and Nebra absorption cases.
- Workspace TypeScript checks and complete production build: PASS.
- `git diff --check`: PASS.

No live match, physical phone, or new browser test was run for this nonvisual change. Existing in-progress matches may retain their previously frozen card definitions; the release applies to newly adapted catalogs/new games. No historical game snapshots are rewritten.

Release procedure: normal feature PR merge, deploy the exact tested merge revision to both Render services, verify deployed commit/assets/health. Then synchronize only MPG's description using the existing authenticated card editor API, freshly rereading and comparing the entire card before sending it, and verify only description/revision/update timestamp changed. No migration or bulk catalog reset.
