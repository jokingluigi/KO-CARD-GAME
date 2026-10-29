# Battle visual readability — requested items 2–18

Implemented on `feat/final-sprite-reactions-review`, following baseline `6ca8672`. The actual shared `GameStatePreview` consumes committed state/events. No combat rules, server, database, economy, card definitions or skin ownership were changed.

| Item | Implementation | Verification |
|---|---|---|
| 2 Multi-target propagation | Source-to-confirmed-target paths and existing licensed Kenney rings. At most two groups/eight endpoints, 800ms cleanup. Shared provenance or a verified multi-target definition is required. Recursive AoE child IDs are grouped within one published update. | Real engine AoE, two targets, both viewports; policy rejects unrelated/zero/combat outcomes. |
| 3 Actual source highlight | Existing source pulse retained; source snapshots survive a spell leaving the hand. | Source cue ordering unit tests; actual source pulse visible in AoE recording. |
| 4 Source/destination link | Existing transfer now uses Kenney `star_01.png`, with current or last confirmed hand/board anchor. | Shared board AoE/source presentation; no arbitrary source guessed. |
| 5 Modified numbers | Attack/health/cost number-only motion, not a whole-card bounce. | Stat cue unit tests, actual buff engine flow. |
| 6 Max HP versus heal | `MAX_HEALTH` has a capacity expansion cue and label; companion HP increases from capacity buffs do not play a heal cue. | Engine BUFF flow + classification tests. |
| 7 Consumed protection | Protection-break cue needs actual blocked/dodged damage and a depleted dodge/entry-protection state. Passive armor is not consumed. Legacy zero-damage combat events are supported. | Real engine DODGE consumption, HP remains 12; visibility sampled at animation frames. Negative unit cases. |
| 8 Silence | Brief silence transition plus persistent subdued artwork/rules instead of dimming the complete frame/numbers. Existing status icons remain. | Engine SILENCE, persistent dim after the cue and transition tests. |
| 9 Transform | Before/after selected-skin artwork wipe. Detect same-instance definition changes for TRANSFORM_SOURCE even without CARD_TRANSFORMED; hide offscreen transformations. | Engine TRANSFORM_SOURCE, privacy unit case. |
| 10 Return to hand | Exact public field instance arriving in a known hand flies to that hand. | Engine MOVE_TO_HAND; cleanup verified. |
| 11 Return to deck | Exact field/own-hand instance arriving in a known deck shrinks to the deck using a concealed back. | Engine MOVE_TO_DECK; no card face leak. |
| 12 Generated versus drawn | CARD_GENERATED has its own flight; ordinary draws keep existing deck flight. Concealed opponent generation uses a back. | Engine GENERATE; no draw-flight emitted; dedup/privacy unit cases. |
| 13 Modified arrival | Modified base/current cost, attack, health pulses only on new hand arrival; granted text marks rules. | Arrival classification unit tests; implementation shares actual hand refs. The precise combined generate+modify case was not separately browser-tested. |
| 14 Attack confirmation focus | Brief brightness/outline on the actual target or portrait window during the existing committed attack anticipation. No extra wait/input change. | Existing attack/landing/combat browser regression; focused keyframe itself not separately asserted. |
| 15 Dense chains | Preserve every outcome/order, speed up long queues and suppress secondary sounds, camera, trails/VFX on quiet cues. | 80-outcome ordering/dedup test. |
| 16 Time pressure | Existing time text plus shrinking underline at ≤10s and dashed border at ≤5s; no flashing. | Actual battle component at 4s, both viewports. |
| 17 First-turn settling | 240ms decorative image settle on intro/mulligan completion, not reconnect. | Existing actual intro→board skip at 390/1440 and natural completion at 390. One initial concurrent transient assertion timed out; isolated retry passed. |
| 18 Awakened frame | Existing rim changes to a double metallic edge with a small crown after actual quest completion; same frame in admin preview. | Confirmed-state fixture both viewports. Admin editor save was not exercised in this task. |

## Synchronization fixes found during validation

- Zone effects now run after the complete DOM commit so new hand/deck refs exist.
- Presentation feedback is keyed by event ID. Previously the finished opacity animation could persist into a subsequent cue.
- Previous card presentation snapshots copy primitive visual state/keywords and are reused once per update; no repeated whole-card scan inside stat comparison.
- Resize clears transient flights/waves and refreshes geometry. Effects do not join the action busy gate.

## Actual checks

- Frontend TypeScript and production build passed.
- 154 targeted policy, sprite, timing, combat and removal-semantics tests passed.
- `effect-readability-browser.mjs`: actual shared battle component with local engine `MOVE_TO_HAND`, `MOVE_TO_DECK`, `GENERATE`, `DAMAGE`, `BUFF`, `SILENCE`, `TRANSFORM_SOURCE`, `ATTACK/DODGE`; 390×844 and 1440×900. No page errors. Reduced-motion check passed. Fixtures use diagnostic artwork, not newly registered final sprite assets.
- Existing atmosphere regression: turn/draw, summon, gold, lifesteal, counterattack, armor, block, retire, lethal and result at 390/1440 passed. Quest completion is an authoritative-state fixture, not a campaign run.
- No-scroll/resizing regression at eight viewports passed, including 360×740, 375×812, 390×844, 412×915, tablet, desktop and landscape.
- Real touch spell-drag regression passed at 360/375/390/412/1440. Field input regression passed at 393×760.
- Headless RAF sample during recording: mobile p50 16.7ms, p95 16.8ms, maximum 100ms; desktop p50 16.7ms, p95 33.3ms, maximum 133.3ms. These include loading/recording and are not physical-device benchmarks or isolated GPU measurements.

## Review artifacts

[Mobile battle recording](screenshots/20261029-effect-readability/battle-390x844.mp4) is silent, recorded from the actual shared battle component and real local engine results. It is not a live authenticated PvP session. The diagnostic artwork says `QA TEMPORARY / NOT FINAL ART`.

[Baseline state](screenshots/20261029-effect-readability/baseline-390.png) · [AoE](screenshots/20261029-effect-readability/aoe-390.png) · [Capacity](screenshots/20261029-effect-readability/capacity-390.png) · [Hand return](screenshots/20261029-effect-readability/return-hand-390.png) · [Generation](screenshots/20261029-effect-readability/generate-390.png) · [Transformation](screenshots/20261029-effect-readability/transform-390.png) · [Silence](screenshots/20261029-effect-readability/silence-390.png) · [Timer](screenshots/20261029-effect-readability/timer-390.png) · [Awakened PC frame](screenshots/20261029-effect-readability/awakened-1440.png)

These are normal-state/effect comparisons, not separately captured pre-change application screenshots. [Measured browser results](screenshots/20261029-effect-readability/results.json).

## Assets and limits

Reuses existing CC0 Kenney Particle Pack `public/vendor/kenney/particle/{star_01,circle_03}.png`, with license at `public/vendor/kenney/particle/LICENSE.txt`. Existing combat/audio packs are unchanged; no new synthesized sound or claim of new SFX.

Unverified: authenticated two-client PvP, reconnect over a real network, full AI/quick-match/draft/tower campaigns, physical mobile hardware, final sprite artwork, admin saving. Shared UI integration covers those modes in code but does not establish end-to-end passage. Redacted hidden card returns without a stable known identity are deliberately not animated as guessed returns. Ambiguous source events do not get speculative links. User perception/accuracy improvements have not been established by user testing.

## Changed files

- `artifacts/ko-game/src/components/battle-zone-visual-policy.ts` and its test; `battle-zone-visuals.tsx`; `effect-readability.css`.
- `game-state-preview.tsx`, `attack-animation.tsx`, `card-leave-animation.tsx`, `card-renderer.tsx`.
- `presentation-feedback.tsx`, `presentation-feedback-utils.ts` and test, `presentation-event-feedback.ts` and test, `presentation-policy.ts`.
- `champion-portrait-frame.tsx`, `battle-sprite-editor.tsx`.
- QA harness `artifacts/ko-game/qa/black-gold-board.tsx`, runner `docs/qa/effect-readability-browser.mjs`, this report and explicit safe review artifacts.
