# Pinfall damage-source restriction — 2026-11-11

## Implementation

The previous `exactZero` retirement marker accepted every actual damage source ending at zero. Ordinary spells, unrelated abilities and non-pinfall card effects could therefore contribute to Pandora's pinfall preparation.

The shared engine now recognizes only wrestler physical combat, Pandora's actual ability source, or an effect source with the active existing `EXACT_ZERO_DAMAGE` (핀폴) trigger. It does not inspect card names or effect text. Pandora uses her stable definition ID and the actual ability proxy instance ID; a reacting card cannot inherit permission merely by sharing Pandora's parent attribution. Card effects snapshot their eligibility on the damage event before subsequent reactions can add/remove pinfall or silence the source.

Both inline and state-based retirement paths apply the same restriction. Actual positive health damage must still end at exactly zero and result in retirement. Overkill, blocked/dodged/zero damage, destruction, removal and health/stat changes do not qualify. Damage itself and normal retirement still occur for ineligible sources; only pinfall recognition, its personal trigger and Pandora's preparation stop. Existing counterattack exclusions for personal retirement triggers are unchanged; direct combat remains direct damage for global preparation.

State-based exact-zero detection now ignores unrelated attack/cost stat changes from damage reactions while continuing to reject a health-only reduction. Registered trigger help text lists the allowed sources. No new keyword, rarity or resource was introduced, and card/champion stats and other effects were not edited.

## Verification actually executed

- **163 engine/content regression checks passed**, including 20 source-rule checks. Coverage includes generic wrestler/spell damage, exact/under/over/zero damage, armor mitigation on direct combat, active/granted/silenced/disabled pinfall, Pandora/other champion abilities, inherited parent attribution, nested lethal damage, source changes after the hit, destruction and health reduction.
- **5 real PvP service/persistence checks passed** against isolated PGlite. Ordinary spell and ordinary entry damage kill normally without pinfall/progress; a pinfall card's entry effects qualify, buff it twice for two kills and advance preparation twice. Both sanitized viewer states and reload agree. Existing Pandora multi-target selection and finisher discovery persist and remain idempotent.
- **3 two-client online browser scenarios passed** at 390×844, 844×390 and 1440×900. Actual Pandora ability selection/confirmation, exact retirement/healing, opponent waiting and reconnect were exercised, with shared real UI and real authoritative service. The browser uses temporary artwork.
- `pnpm build` passed, including type checks. Initial new test fixtures incorrectly expected effect armor reduction (armor is combat-only) and omitted the normal quest-processing boundary; those fixtures were corrected. A nested attack-stat reaction additionally exposed and fixed the old broad stat-change check.

No Production DB writes, production match creation or schema change. Test definitions were not added to the operating card pool. Existing completed historical events/progress in stored matches are not retroactively rewritten. Actual AI gameplay was not separately automated; AI and other modes use the same shared engine.

## Changed files

- `artifacts/ko-game/src/game/engine/pinfall.ts`
- `artifacts/ko-game/src/game/engine/balance-effects.ts`
- `artifacts/ko-game/src/game/effects/effect-engine.ts`
- `artifacts/ko-game/src/game/events/types.ts`
- `lib/effect-registry/src/index.ts`
- `artifacts/ko-game/src/game/engine/pinfall-sources.test.ts`
- `docs/qa/balance-content-20261111-service.test.mjs`

Deployment receipts will be recorded after API-first/frontend-second release; main is not merged.
