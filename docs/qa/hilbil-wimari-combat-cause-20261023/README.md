# Hilbil / Wimari combat retirement healing

## Confirmed defect

The user reported Hilbil attacking and retiring an opponent while Wimari was present. A fresh authenticated read confirmed unchanged current definitions: Hilbil fully heals itself after personally retiring an opposing wrestler; normal Wimari adds one current/maximum health to the attacking ally and allied champion.

The earlier regression's plain target still passed. Real opponents **Black Out (블랙 아웃), Zombie Bellona (좀비 벨로나), and 뒷정리맨** exposed another path: their SELF_DAMAGED reaction runs before Wimari's combo/final combat death pass. Its nested effect resolution settled lethal damage without the combat root. CARD_RETIRED then named SYSTEM instead of Hilbil, so its SOURCE_RETIRED_TARGET heal never ran. This also failed without Wimari; Wimari was present in the reported combination rather than the sole cause. The exact opponent in the user's incident is unknown.

## Correction

Carry the combat root through SELF_DAMAGED, FIRST_ATTACKED, EXACT_ZERO_DAMAGE, ATTACK_SURVIVED and SELF_ATTACK. Existing state-based death resolution can then recover the actual DAMAGE_DEALT source, including counterattacks. Each reacting card retains its own effect actor; damage, healing values, trigger order and retirement rules are unchanged. The prior OTHER_ALLY_ATTACK fix remains intact. No global history scanning, extra polling, production schema change, card definition edits or database writes are introduced.

## Executed checks

- Existing focused baseline: **15/15 PASS** before the fix.
- Expanded real-opponent reproduction: **33 cases, 18 FAIL / 15 PASS before**, **33/33 PASS after**. Covers three real opponents, zero/one/two Wimaris, both player positions and JSON-serialized starting states. Asserts full current/max HP, champion health, actual killer attribution, exactly one graveyard/retirement record and no stuck target frame. [Before](before.log).
- Final focused suite: **50 PASS / 0 FAIL / 0 SKIP**. Adds counterattack kills; four automatic trigger-stage edges; nonlethal/other-killer/silenced/disabled/simultaneous-death guards; effect-damage kills; serialized listener retry deduplication; reactive damage's independent actor. [After](after.log).
- Full supported engine runner: **2,743 PASS / 0 FAIL / 0 SKIP**, 126.18 seconds, including existing AI simulations. This run included the initial 40 focused cases; the ten subsequent cases were exercised separately in the final 50-case run. The runner's four pre-existing historical-catalog exclusions are unchanged and are not included in its pass count.
- Full workspace typecheck and frontend/API production builds: PASS.
- Diff whitespace check: PASS.

Tests used local fixtures and the real shared executeAction/applyEffect engine. They did not create operating-account matches, modify production cards or consume production DB queries per test. Three current card definitions were read for comparison. No physical phone, two-account live production match, or end-to-end browser interaction was performed; no UI code changed.

## Release

Use a feature PR and ordinary merge, deploy the exact tested release to both existing Render services, then verify service revisions, selected built asset hashes and both health endpoints. No migration or catalog rewrite is required. Already-open clients should refresh to receive the patched browser engine; no active game state is forcibly reset.
