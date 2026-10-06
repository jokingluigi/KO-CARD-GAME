# Mechanic changes requested on 2026-10-06

- ARMOR reduces attack and retaliation damage only. Effect damage bypasses armor; DEFENSE, DODGE and explicit card-specific reductions remain independent.
- Wrestler ACTIVE cannot be used on its entry turn, even with RUSH. It becomes available on the next owner turn. Direct, legal-action and targeted precommit paths enforce the same rule. Summon and return/replay paths also enforce entry cooldown.
- Luna retains first-attacker silence and now silences herself instead of disabling her ability. This removes her keywords and buffs without healing lethal damage. Migration 0047 backs up the exact old record and applies once; later administrator edits are preserved.
- A match turn contains both players' consecutive action turns: 1/2 -> 1, 3/4 -> 2. Display, TURN conditions and recap use the shared conversion. Internal action-turn counters and duration handling remain unchanged.
- Stored card cost, attack and health are preserved.

## Validation

- Targeted regressions: 31 passed, including real owned-deck/draw/serialized-state play, direct ACTIVE, targeted precommit, opponent-turn summons, replay, lethal Luna combat and PGlite migration backup/idempotence/stat preservation.
- Final selected regression suite: 1,477 passed, 0 failed. Excludes unrelated Windows-incompatible auth-timeout/maintenance/install-app tests and the separately executed AI 100-match test.
- AI catalog simulation: 100/100 finished, 6,331 actions, 22,322 events; no failures, timeouts or interruptions. Catalog: 85 published cards, 7 champions, both first-player seats, 42 champion pairings.
- Shared libraries, client and server TypeScript checks passed.
- Client production build and server bundle build passed. Existing client sourcemap/chunk-size warnings remain.
- Actual GameStatePreview SSR rendered with production CSS: mobile 319px and desktop 1280px inspected; action turns 1/2 show turn 1, action turn 3 shows turn 2. This is a layout check, not an authenticated production PvP session.
- Historical catalog fixtures are retained; old-rule assertions explicitly updated for the requested new rules.

## Deployment verification

Production catalog and asset verification is performed after PR merge. Authentication-dependent two-player production PvP remains unverified.
