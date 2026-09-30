# Yeoul gold quest checkpoint

Migration 0031 preserves the existing Yeoul base ability, costs, media and status, backs up originals once, sets a thirty actual gold spent quest and an upgraded ability reserving one extra gold next turn plus summoning the existing named Champion token. The explicitly requested bodyguard token is published if DRAFT, preserving its stats/effects/media; original token record is backed up. Missing/ambiguous/disabled token prevents applying the patch and emits a warning. Restart preserves later admin edits.

Gold spending sums actual negative CARD_COST, CHAMPION_ABILITY_COST and CARD_EFFECT_COST events; excludes turn-end resets, gold gain and generic effect drains. Added missing technique cost and remaining-gold buff payment events. Tower bonuses cannot inflate this quest.

Passed: stored DB write/reload/engine test, actual technique payment/insufficient gold, additional effect spending, excluded gold changes, replay prevention, ability spending to thirty, single completion, upgrade bonus and existing 1/4 token summon, preservation on restart. Startup tests passed; 365 shared engine/effect/quest/Tower regression tests, frontend/API typechecks and builds passed. Live deployment verification pending.
