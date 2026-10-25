# External professional assets — integration in progress

Overall project is NOT complete. No production deployment, main merge or Production DB change.

## Acquisition and rights

Kenney/Brackeys/itch.io/Sonniss/Pixabay/OpenGameArt web access returned403 in this environment. GitHub distribution mirrors were accessible. Included original licenses permit commercial use and redistribution (CC0-1.0). Each manifest entry pins a revision, original path and SHA-256. Kenney authored the files; Calinou/Boyquotes packaged the distributions. No purchases and no copied reference-game art/audio. Original license files ship beside assets. These are real external textures/sound files, not generated substitutes. scripts/assets/fetch-external-assets.py restores exactly the pinned bytes.

## Actual production-code integration

- Shared BattleVfx now stamps external authored textures for IMPACT/BLOCK/HEAL/MAGIC/GOLD/DESTROY/RETIRE. Removed the previous procedural polygon/glow renderer from this component. Animation/positioning/direction remain client code. Shared consumers include attack, summon, spell, leave and quest effects, across PvP/AI/draft/tower.
- Attack contact flash/ring now use external PNGs; the previous CSS background/border are disabled for these elements. Existing animation trajectory/hitstop remains.
- Audio manager redirects only bundled fallback sound paths. Actual admin-uploaded audio remains unmodified. Base impact, movement, summon impact/bass and KO glass now resolve to external files. Existing SFX gain, priority, caps and BGM ducking apply.
- Semantic feedback adds external armor, block, heal, destruction, retire, remove, ability, quest and resource sounds. Nonbattle button clicks use external interface sounds with100ms input throttle, skip disabled/default-prevented/admin/battle buttons. Game rules and economy unchanged.
- Removed the previous self-generated movement WAV and generation script.

## Validation

44 automated tests passed including file hashes/existence, fallback mapping, audio gain/priority, impact timelines and geometry. Full production typecheck/build passed. Shared animation browser checks passed for360×740,375×812,390×844,412×915,768×1024,1440×900. Contact hold, shock, base/bass playback ordering, resize/WAAPI failure recovery and exactly-once callbacks checked. The later low-frequency external bass change was rerun.

Real isolated HTTP/WebSocket/PGlite browser regressions passed for PvP two clients/reload/cosmetics, draft two clients/persisted state and mobile tower KO→result→reward→card swap. These suites are not full audiovisual coverage or physical-device tests. Test accounts/data are isolated; screenshots include fixture cards. No production match or user data was written.

Browser audio was captured from actual HTMLMediaElement playback through Web Audio to MediaRecorder (routing only, no synthesis). with-browser-audio.webm muxes actual captured audio and animation fixture video. Mux start offset is uncalibrated; do not infer hardware latency or precise audiovisual synchronization from this file. No PulseAudio/physical output capture available. No claimed listening review or user study.

## Quality limitations and unfinished work

The Kenney particle pack is authored static texture art, NOT a bespoke hand-animated fighting-game impact flipbook. Integrating it does not prove reference-level visual quality. Candidate searches for additional licensed impact flipbooks returned no usable result yet. Do not label this as achieving the supplied Hearthstone footage.

Not all major effects have been replaced: legacy CSS portions remain in summon, death, awakening, KO and other cinematic layers. Full differentiated sound families for magic/lifesteal/awakening/victory/defeat still need appropriate files and review. Whole-game layout/interaction overhaul is incomplete. Specific intro failures and intermittent blue/purple background cause remain unconfirmed. Existing shipped pair dialogue/fallback fixes retained. Real-user missing-intro case, every game mode/event combination, touch during shake, physical-mobile GPU/memory, audio peaks and fatigue unverified. No blanket completion claim.

## File inventory

Public root: artifacts/ko-game/public/vendor/kenney/. Exact URLs/hashes/revisions: manifest.json.

| File | Bytes | Runtime role / candidate status |
|---|---:|---|
| `particle/spark_01.png` | 89628 | VFX texture |
| `particle/spark_04.png` | 78726 | VFX texture |
| `particle/smoke_01.png` | 91637 | VFX texture |
| `particle/smoke_04.png` | 92360 | VFX texture |
| `particle/smoke_07.png` | 74367 | VFX texture |
| `particle/dirt_01.png` | 46129 | VFX texture |
| `particle/magic_01.png` | 77122 | VFX texture |
| `particle/magic_03.png` | 55275 | VFX texture |
| `particle/star_01.png` | 39485 | VFX texture |
| `particle/slash_01.png` | 23710 | VFX texture |
| `particle/light_01.png` | 86592 | VFX texture |
| `particle/circle_03.png` | 69716 | VFX texture |
| `impact/impact_punch_medium_000.ogg` | 8800 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `impact/impact_punch_medium_001.ogg` | 8701 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `impact/impact_punch_heavy_000.ogg` | 11617 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `impact/impact_punch_heavy_001.ogg` | 10861 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `impact/impact_metal_medium_000.ogg` | 7117 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `impact/impact_glass_heavy_000.ogg` | 7403 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `impact/impact_soft_heavy_000.ogg` | 6570 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `impact/impact_generic_light_000.ogg` | 5827 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `impact/impact_wood_heavy_000.ogg` | 6233 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `interface/click_001.wav` | 10190 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `interface/confirmation_001.wav` | 26062 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `interface/error_001.wav` | 30542 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `interface/maximize_001.wav` | 23118 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `interface/minimize_001.wav` | 24014 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `interface/drop_001.wav` | 23374 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `interface/scratch_001.wav` | 14286 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `interface/bong_001.wav` | 11726 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `particle/scratch_01.png` | 61785 | VFX texture |
| `interface/glass_001.wav` | 25806 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `rpg/knife_slice.ogg` | 15532 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `rpg/cloth_1.ogg` | 16508 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `rpg/handle_coins.ogg` | 25394 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `scifi/low_frequency_explosion_000.ogg` | 14317 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `scifi/explosion_crunch_000.ogg` | 28274 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |
| `scifi/force_field_000.ogg` | 25672 | SFX; see external-assets.ts / presentation-feedback.tsx / App.tsx (some acquired variants remain candidates) |

Total: 37 files, 1,274,476 bytes excluding licenses/manifest. No new external CDN runtime dependency; bundled static assets are cacheable.
