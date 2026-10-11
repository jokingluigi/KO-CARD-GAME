# Current card and champion effects — 2026-10-12

Production admin data was read, without changing stored content: 129 cards and 11 champions, including unpublished and token records. Versioned test fixtures preserve that content. Explicit administrator effect definitions retain priority over reviewed text bindings.

## Changes

- Reviewed bindings: Nebra messenger/attack drain, captain direct-hit bonus, Briganda Wanted/bonus gold, Leon causal retirement, both Belmort variants, destruction recovery and once-per-turn limit, corpse collector, executioner, Edelweiss countdown, recruitment, Seal, Hero Birth and Ruin Ritual.
- Preserve original/granted abilities, prevent duplicate messenger grant and spent Dodge replenishment.
- Crusaders ability: one random allied ATK increase and champion healing. Quest summons the configured awakening tank at the live threshold.
- Correct awakened Leon alias, Wimari combo recipient and unrestricted Assemble random pool.
- Shared runtime adds before-attack, causal retirement and actual destruction listeners; retirement replacement preserves RETIRE/DESTROY/graveyard separation. Serialization retains once-per-turn usage and event deduplication.
- Seal explicitly preserves modified stats in the caster deck; default zone-reset behavior remains unchanged.
- Dynamic ritual repetition uses captured ATK above eight and stops at match end.
- During target selection, corner inspection and clickable rules explanations yield to card targeting; ordinary card information remains available afterward. This fixes the 320px champion reward replacement regression found by CI.
- Mobile targeting banner no longer consumes a field grid row. Main controls stay on one row when targeting/cancel feedback appears; card tracks use CSS Grid.

## Executed validation

- Current-engine runner: 1,854 passed, 0 failed, 0 skipped. Four historical catalog-specific suites are intentionally outside that runner and are not reported as passing.
- Every latest card converted and continued through real legal actions, AI choices and six turn transitions, with state serialization between actions.
- All 11 champions converted; all 9 with active ability text executed actual USE_CHAMPION_ABILITY actions. Semantic assertions cover Crusaders ability and 25 to 5 HP quest reward.
- Targeted assertions cover causal retirement versus destroy, silence, replacement combat/effect deaths without graveyard insertion, recovery turn limits/serialization, no valid targets, current stat transfers and 12-point ritual damage.
- Browser: 35 real pointer/touch interactions passed at 360×740, 375×812, 390×844, 412×915 and 1440×900. Five spells, Nebra summon/ally targeting and Crusaders ability at each size. Zero page errors and horizontal overflow checks passed.
- Browser uses the development QA host with production CSS and live content fixtures. It executes the shared gameplay engine and production battle component. QA-only API requests are mocked; this is not a live authenticated PvP match.
- Existing portrait browser regression also passed at all four mobile sizes: hands of 1/2/3/5/10, summon/draw/quest/attack/champion/active/log/graveyard/emote/end turn, rotation and reduced viewport height. Field readability and viewport containment assertions passed.
- Champion feature browser regression passed on desktop, 390px and 320px: full-field reward replacement to hand/deck, state restoration, retirement/destruction dialogue, start ability save and visibility/draft controls.
- Full workspace typecheck, frontend build and API server build passed.
- Existing public-catalog AI regression: 100 full matches completed, 5,420 actions. Its older 85-public-card/7-champion snapshot is distinct from the latest 129-card continuation test.

## Limits

No physical Android device, two-client live PvP match or full Tower run was executed in this patch. New individual effect semantics were asserted in the common engine; passing catalog continuation alone does not prove every possible effect interaction. No database migration or content rewrite is required. Source deployment must be verified separately.
