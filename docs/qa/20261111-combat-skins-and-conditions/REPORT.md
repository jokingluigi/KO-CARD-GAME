# Combat skins and requested condition fixes — 2026-11-11

## Implemented

AttackAnimation rebuilt both combat cards without a definition ID or cosmetic controller ID, causing the default artwork to temporarily replace selected skins. Both renderers now use the card ID and controller captured at attack declaration. Own online actions retain the controller in PendingAttack; local/AI own actions capture canonical player IDs; incoming/automatic presentations use authoritative source/target snapshots. This survives card retirement during combat and different viewer perspectives. Existing skin artwork placement, token entitlement and fallback rules remain in use.

Joking Luigi's adjacent random-summon definition now sets `excludeChampionRarity`. The common balance catalog pool honors that opt-in flag; other random effects keep their existing rules. Its ordinary tagged wrestler summons still receive the existing taunt and +1/+1 buff. No Production card data was edited.

Read the current administrator record for Rosie (champion-minion-a), version 30. Mimic's description is now `레전더리 혹은 챔피언 등급 카드를 3장 이상 필드에 내기`. The reviewed condition mapping counts SELF CARD_PLAYED WRESTLER events with a combined LEGENDARY/CHAMPION filter, required 3. The common event condition supports an optional validated rarity list, preserving the original single-rarity field. Mixed rarities accumulate together. Existing generation branch and exclusive finisher reward behavior remain unchanged.

The wording does not explicitly say whether effect summons/spells should count. A clarification was requested; with no response after a reasonable interval, the stated assumption is directly played wrestlers only. Generated cards, effect-only summons, spells and opponent actions do not contribute. The minimal read-only current record snapshot is `docs/qa/snapshots/20261111-combat-fixes/rosie-condition.json`.

## Verification actually executed

- Current balance/content checks: **105 passed, 0 failed**, including champion-only adjacent candidate rejection, mixed ordinary/champion candidates, retained taunt/buffs, and actual mixed-rarity hand plays completing Mimic once on the third wrestler.
- Existing quest/finisher foundation, delivery and choice regressions: **48 passed, 0 failed**.
- Real online service + isolated PGlite + two actual online browser pages: **15 scenarios passed**, across 390×844, 844×390 and 1440×900. Each runs accepted server attack actions and samples both attacker/defender artwork every animation frame on both clients.
- Cases: own attack, opponent attack, mutual lethal combat, champion target and no equipped skins. Same base card has different skins and placement on each side; skin URL, scale and ownership remain correct. Mutual lethal combat moves both cards to the graveyard without losing animation skins.
- `pnpm build`: passed, including type checks.

The initial browser fixture used local player IDs rather than canonical online seats and was corrected; it also corrected its cosmetic key format. These were QA fixture errors, not reported product failures. Artwork is a temporary local image at distinct skin URLs, so the checks validate skin selection/placement rather than the art of every production skin. Actual AI animation playback was not separately automated; the shared renderer and own-action producer are updated, and PvP is exercised on both views. All write tests use isolated fixtures. No Production DB writes, no production match creation, no schema change.

## Changed product files

- `artifacts/ko-game/src/components/attack-animation-utils.ts`
- `artifacts/ko-game/src/components/attack-animation.tsx`
- `artifacts/ko-game/src/components/game-state-preview.tsx`
- `artifacts/ko-game/src/pages/online-match.tsx`
- `artifacts/ko-game/src/pages/home.tsx`
- `artifacts/ko-game/src/game/cards/reviewed-admin-content-20261111.ts`
- `artifacts/ko-game/src/game/engine/balance-effects.ts`
- `artifacts/ko-game/src/game/champions/balance-content-20261111.ts`
- `lib/game-engine/src/champion-quest-conditions.ts`

QA producer and tests: `artifacts/ko-game/qa/black-gold-board.tsx`, `artifacts/ko-game/src/game/qa/balance-content-20261111.test.ts`, `docs/qa/combat-card-skins-20261111-browser.mjs`.

Deployment receipts are added after API-first, frontend-second release. Main is not merged.

## Release verified

Source `ce63a855366c4abb3e2a9c8d1f49729c3e075998` is live on API (`dep-dbq9hioae00c73achtg0`) and frontend (`dep-dbq9igdg1s2s7381gkf0`). The frontend deploy command initially failed its short public-revision check because cached routes still served the previous revision despite the new `/index.html` and bundle being present. Header inspection showed cached old HTML (`s-maxage=300`) and an old version document with cache HIT/age. Extended read-only checks waited for the actual version, root and admin routes; all finally served the new revision. No duplicate deploy or rollback was performed. This release did not change Render cache policies; delayed route propagation remains a deployment consideration.

Final checks verified both live immutable revisions and pinned deployment configuration, actual root/admin entry revision, delivered battle/home/online modules with controller metadata, and the current public Rosie record passed through the shared mapper. This last mapping check reads live data but executes locally; it is not a production match test. See `production-verification.json`, `production-feature-checks.json` and `serving-propagation.log`. No main merge or manual Production DB edit.
