# Newly reported card effects — 2026-10-05 KST

Read-only current public catalog: 85 production records retrieved from /api/cards; no card rows or cost/ATK/HP changed. Previous fixture tests missed actual combat and alternating-turn failures.

- FAIL → FIXED → PASS: Zombie Bellona SELF_DAMAGED was dispatched in combat only for Black Out. Dispatch now runs for any positively damaged participant through the existing ability resolver. Damage-free combat and silence do not summon. Counter damage summons. Existing effect damage dispatch preserved.
- FAIL → FIXED → PASS: Helper read global turn-1, losing healing recorded in its own prior turn when the opponent intervened. Resolve owner's previous completed turn from TURN_ENDED events; historical/synthetic states without events retain previous global-turn fallback. Strict overflow >5 preserved. Token generation uses the existing catalog and engine.
- PASS: Cassandra actual hand entrance and end turn, both tagged fields receive +1 HP and REGEN, allied field/champion heal. Live browser: summoned Cassandra; both enemy targets rose from 10 to 11 HP, allied injured target from 5 to 6 HP and gained REGEN. End-turn healing event visible, next owner turn reached.
- PASS: current public techniques (10 usable techniques) execute through PLAY_TECHNIQUE and SELECT_EFFECT_TARGET, pay printed cost and assert actual damage/buff/silence/stun/exchange/bounce/summon results. Defeat token remains an existing hand-turn-end rule, covered by previous engine regression.
- PASS: 16 current-production-data tests; all 85 normalization specs unchanged.
- PASS: 1,020 shared engine/turn/combat/new-card/epic-technique/current-catalog/AI continuation regression tests (run before two additional current-data assertions); zero failures/skips. Frontend/API type checks and both builds passed.
- UNVERIFIED: real-phone interaction and exhaustive live PvP/AI play of every card. No production purchases, reward claims, balances, original card/champion saves or deck deletion performed.

Changes: shared combat damage trigger dispatch; Helper owner-turn lookup; actual-action regression tests and read-only current public fixture.
