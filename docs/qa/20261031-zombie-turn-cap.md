# Zombie retirement growth: twice per displayed match turn

The user explicitly requested a total of two retirement-growth activations across the displayed turn (both players' action turns together), rather than two on each player's action turn.

## Changes

- Use the existing canonical `matchTurnNumber(state.turn)` for the growth window. A zombie that grows twice during action turn 3 cannot grow again during action turn 4; both display as match turn 2. Uses refresh when action turn 5 begins, which displays match turn 3.
- Preserve independent counters per zombie instance across both players. Persist optional `matchTurn` alongside the legacy action-turn field; old serialized counters derive their displayed window from their existing action-turn number. New matches still start without a consumed counter.
- Remove the description-exact-match gate. The two-use rule now applies to recognized zombie tokens independently of punctuation, stale descriptions or granted card text. Printed card data and production catalog records are unchanged.
- Summon absorption remains a separate buff and does not consume or reset retirement-growth uses. Existing all-zombie recipients, silence/disable eligibility, allied retirement filtering and duplicate-event protection remain intact. Enemy retirements, destroy/vanish and self-retirement do not become extra allied growth events.
- Update the old balance regression which intentionally expected an opponent-turn refresh to assert the newly requested paired-turn boundary instead.

## Validation

631 engine tests passed: zombie multi-buff/cap cases, balance patch 20261024, admin revisions 20261013/14, current catalog effects, combat mechanics and once-only active abilities. New coverage includes both owners, uses split across action turns, exhaustion before the opponent acts, next displayed-turn refresh, serialized/legacy counters, independent opposing-player counters, separate summon buffs and immunity of the cap to display/granted-text changes.

A local engine sequence using the current publicly fetched Zombie record confirms 1/1 → 2/2 → 3/3, no third growth; remains 3/3 throughout the opponent action turn; becomes 4/4 on the next displayed turn's first retirement. A separate champion summon adds +1/+1 without increasing the retirement count. [Sequence](20261031-zombie-turn-cap/engine-sequence.json).

Common battle UI regression at 360×740, 390×844, 740×360 and 1440×900 passed: actual champion ability buffs all three zombies; effect target focus/input/cancel/rotation and spell resolution still work. This uses the real common UI/local engine with mocked API/media; it does not represent live PvP or physical-device testing. [Results](20261031-zombie-turn-cap/ui-regression.json).

Frontend/API typechecks and production builds passed. Production catalog was read only to inspect current wording; no database/schema/card/account/reward data changes. No main merge. Historical instances already granted extra stats before deployment are not retroactively reduced.
