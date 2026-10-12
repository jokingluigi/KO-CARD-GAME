# Visual/audio remaster — verification record (2026-10-13)

## Implemented behavior

The shared React battle view continues to use existing authoritative engine events. The existing cinematic policy, screen-impact manager, card motion and audio manager were extended; no new animation framework or database migration was introduced.

- Drag and tap use existing legal-action callbacks. Mobile long-press (430ms) opens the existing inspector, consumes its tap and does not commit an attack. Beginning either drag clears the hold timer. Post-selection long-press survives touch-release focus changes; mobile selection fits the hand rail without combining a second hover transform.
- Attack drag draws a directional arrow and target lock against current legal targets. The ~damage label is an estimate from visible attack and the existing armor/entry-defense calculator; later champion/card effects may change it.
- The shared attacker/defender timeline uses attack force for motion and confirmed damage for numbers. Fully prevented damage receives no damaging hitstop. Existing camera ownership, priority, directional kick/recoil and motion accessibility remain.
- Summon cost defines physical tier/bass. Rarity defines spectacle, with a bounded additional motion accent. A cost-1 Legendary remains LIGHT. Legendary wrestler and spell use a 1,180ms central reveal; no second character panel obscures the card.
- A local skip finishes presentation once, suppresses late landing callbacks, cancels camera/impact and restores persistent music. Major conclusions compress pending Legendary/awakening scenes into acknowledgements. Quest completion never grants rewards from presentation callbacks.
- Fixed particle count/resolution policy across devices replaces graphics quality presets. Viewport geometry and accessibility remain adaptive.
- Confirmed vanish uses a closing black vortex; destruction adds cracks; retirement preserves collapse/sink. Fusion uses the existing merge, confirmed stat values and authoritative vanish.
- Known SUMMON, REVIVE and CHAMPION_DEPLOY origins are visualized without assuming an unknown source. Own field/graveyard-to-hand and hand-to-deck transitions use confirmed instance movement. Opponent hand identities are never used.
- Dialogue types quickly with existing lines; actual emotes apply brief emotion-specific portrait movement. Existing six-choice menu and server situational AI emotes are reused.
- Champion portrait defeat uses existing fracture/shards around 1.9 seconds, local skip and champion-centric result art. Giant K.O. text was removed. Existing PvP/AI/Tower result callbacks and account rewards are preserved.
- Pack receipts are granted by the existing server transaction before presentation. Drag/tap opens the paper pack; cards reveal individually in any order. Skip only changes the local reveal. Legendary pack media is short rather than battle entrance music.
- The card collection UPSERT now returns actual quantity into ownedBefore/ownedAfter stored in the idempotent receipt. Odds, inventory consumption, rewards and quantities are unchanged.

## Architecture and cleanup

Authoritative event/snapshot -> existing presentation adapters -> cinematic/impact policy -> React/WAAPI/CSS/audio. Cinematic priorities never reorder engine triggers. Same-event IDs are deduplicated; ordinary bursts compress. Attack/summon timelines have timed completion fallbacks. Resize, backgrounding, cancellation and unmount remove motion layers; skip clears temporary music and resumes the current persistent BGM. Original card keyword/status rendering is preserved. No tag banners, links or panels were added.

## Tests actually run locally

Environment: Windows, Node 24, Chrome headless with genuine browser pointer/touch events, isolated PGlite + authenticated HTTP sessions. No production reward or collection mutation.

| Check | Result |
|---|---|
| Workspace TypeScript | PASS |
| Frontend and API build | PASS (existing tooltip sourcemap warning remains) |
| Focused cinematic/impact/zone/audio policies | 57/57 PASS |
| Inspector metadata/keyboard regressions | 12/12 PASS |
| Complete production styles: hand 1/2/3/5/10, champion/active/log/graveyard/emote/turn/rotation | PASS: four required portrait viewports |
| Normal-user pack HTTP ownership, receipt retry and user-B/anonymous isolation | 2/2 PASS |
| Current checked-in card/Champion/engine suite | 1,855/1,855 PASS |
| Catalog AI matches | 100/100 finished; 0 failures/timeouts (checked-in public snapshot 2026-10-07) |
| Drag summon, invalid return, cancellation and settings | PASS: 360x740, 375x812, 390x844, 412x915, 1440x900 |
| Pack drag/tap, out-of-order reveals, skip, owned 2->3, long-press and drag attack | PASS: same five viewports |
| Central Legendary bounds, cost-1 LIGHT landing, skip exactly once, Legendary/KO compression | PASS: same five viewports |
| Shared cinematic queue, missing art, burst, reconnect reset, resize and input | PASS: desktop, portrait, small, landscape, 4x CPU throttle and reduced motion |
| Classic attack/block/spell/summon/heal/retire/destroy/quest/result callbacks | PASS: five desktop/mobile/landscape/accessibility variants |
| Shared event presentation and immutable engine state | PASS: desktop/mobile/small/throttled/reduced |
| Cost 1-6, rarities, landing/sound clock, priorities, shake modes, cancellation | PASS: six viewport/accessibility variants |
| Real delayed Legendary audio and persistent BGM restoration | PASS: desktop + touch portrait |
| Champion token/deploy, fusion/vanish, full hand, retirement/destruction browser suite | PASS |

Evidence is saved under qa-results/remaster*. Screenshots: qa-results/remaster/.

An initial CI run failed because the new pack test asserted the special overlay before React committed its effect. The test now waits for the real overlay. A raw development-style diagnostic also showed an active-button overlap; the complete production stylesheet path passes the reachability test. CI rerun and live rollout are recorded after completion.

## Exact limitations

- No field-slot destruction/restoration state or event exists in the current engine. No fake persistent void was added. Supporting a new game mechanic would require a separate rules task.
- The current damage event does not consistently expose attempted damage or exact armor-blocked amount. A generic armor reaction is used; no guessed blocked amount is displayed.
- Some champion/lifesteal healing paths update authoritative HP without a dedicated resolved-heal event. A causal energy transfer or gross healing number cannot safely be reconstructed from net snapshots; no fabricated amount/source was added.
- Unknown summon origins use a generic special-summon presentation.
- Existing sound kit/music is reused. New dedicated draw/generation/vanish/transformation/rejection/pack audio assets were not invented; those events need reviewed audio assets for a fully distinct sound palette.
- Physical Android, physical gamepad and a new two-client live PvP reconnect/network-reorder session have not been performed. Emulated touch/viewport tests are not hardware tests.
- This record does not certify the subjective AAA quality target or every production card added after the checked-in catalog snapshot.

## Deployment

Branch: feat/visual-audio-remaster-20261013. No migration or new environment variables. PR/CI/production rollout status is recorded separately after execution. No production data reset, balance change, shop update or arbitrary reward grant.

## Changed files

- .github/workflows/startup-validation.yml
- artifacts/api-server/src/routes/collection.ts
- artifacts/api-server/src/routes/packs.ts
- artifacts/ko-game/qa/impact.tsx
- artifacts/ko-game/src/audio/audio-manager.test.ts
- artifacts/ko-game/src/audio/audio-manager.ts
- artifacts/ko-game/src/components/alt-inspector.tsx
- artifacts/ko-game/src/components/attack-aim.tsx
- artifacts/ko-game/src/components/attack-animation.tsx
- artifacts/ko-game/src/components/battle-card-drag.tsx
- artifacts/ko-game/src/components/battle-vfx-model.test.ts
- artifacts/ko-game/src/components/battle-vfx-model.ts
- artifacts/ko-game/src/components/card-leave-animation.tsx
- artifacts/ko-game/src/components/card-play-animation-utils.ts
- artifacts/ko-game/src/components/card-play-animation.tsx
- artifacts/ko-game/src/components/cinematic-layer.tsx
- artifacts/ko-game/src/components/cinematic-policy.test.ts
- artifacts/ko-game/src/components/cinematic-policy.ts
- artifacts/ko-game/src/components/combat-preferences.ts
- artifacts/ko-game/src/components/combat-settings.tsx
- artifacts/ko-game/src/components/fighting-feel.test.ts
- artifacts/ko-game/src/components/game-state-preview.tsx
- artifacts/ko-game/src/components/match-result-overlay.tsx
- artifacts/ko-game/src/components/pack-opening.tsx
- artifacts/ko-game/src/components/presentation-event-feedback.ts
- artifacts/ko-game/src/components/quest-presentation.tsx
- artifacts/ko-game/src/components/screen-impact-policy.test.ts
- artifacts/ko-game/src/components/screen-impact-policy.ts
- artifacts/ko-game/src/components/screen-impact.tsx
- artifacts/ko-game/src/lib/collection-client.ts
- docs/qa/fighting-controls-browser.mjs
- docs/qa/heavy-impact-browser.mjs
- artifacts/ko-game/qa/remaster.html
- artifacts/ko-game/qa/remaster.tsx
- artifacts/ko-game/src/components/typed-dialogue.tsx
- artifacts/ko-game/src/components/zone-transfer-policy.test.ts
- artifacts/ko-game/src/components/zone-transfer-policy.ts
- artifacts/ko-game/src/components/zone-transfer.tsx
- artifacts/ko-game/src/remaster-presentation.css
- docs/qa/remaster-browser.mjs
- docs/qa/remaster-cinematic-browser.mjs
- lib/db/qa/pack-receipt-http.test.ts

- docs/qa/mobile-portrait-battle-browser.mjs
