# Physical combat overhaul — first implementation, project incomplete

Base: abd6a4f. Branch: feat/physical-combat-overhaul. No deployment, main merge or Production DB mutation.

## Reference evidence

Provided MP4 was accessible: 720×1268, 30000/1001 fps, 21.269 seconds, audio track present. Extracted one-second overview and consecutive 30fps frames from 11.5–12.3s. Observed attacker advancing toward the top target, a local white contact flash, damage marking, expanding dust and a return toward the starting field. Existing impact-390x844.webm was also opened as a frame sheet. No claim of listening evaluation, reference audio timing measurement or subjective user testing. No reference image/audio copied into game assets.

## Implemented

- combat-contact.ts: viewport-space rectangular edge contact, preserving the target's centre visibility. The attack scale1.06 is included, with at most8px contact overlap. Degenerate/overlapping geometry stays finite. VFX and camera request share the computed contact point. Combat results and targeting geometry are unchanged.
- attack-animation.tsx: uses new contact geometry; starts original movement cue only during acceleration and only once. Existing base-hit/low-end ordering and confirmed-damage profile retained. Hitstop remains35/60/90/125/140ms (blocked0); no server timer pauses.
- battle-vfx.tsx: impact branch now draws matte dust lobes and directional polygon chips with a short local flash. Existing healing, block and other semantic branches preserved. Existing mobile20/desktop36 particle and DPR caps remain. Canvas clears at end; RAF cancelled on unmount.
- battle-presentation.css: impact ring/flash positioned at the same contact point.
- presentation-motion.tsx: resource/health text renders the authoritative number immediately, with180ms emphasis rather than260ms intermediate invented numbers. Reduced motion respected. This is a clarity/synchronization design hypothesis, not measured user satisfaction.
- public/sfx/combat-movement.wav: original procedural filtered-noise swish,120ms mono22050Hz PCM16,5336bytes, peak0.35 (-9.1dBFS). Reproducible generator scripts/audio/generate-combat-swish.py; no third-party samples. Existing SFX gain/mute/priority/channel bounds apply. Not a completed replacement sound library; perceived sound quality and output-device latency unverified.

## Verification

42 automated tests passed (geometry/impact model/audio manager). Final production typecheck/build also passed after the authoritative-number change. Six viewport browser checks:360×740,375×812,390×844,412×915,768×1024,1440×900. Heavy, blocked and finishing attacks: joint hold, reaction, contact shock, base/bass order, exactly-once callbacks, resize and unsupported WAAPI recovery passed. Light/normal profile timing checked by unit tests, not all independently played in browser.

Captured animation clock step p95 across18 samples:16.7–50ms; worst gap50ms in headless Chromium with video capture. These are sampling gaps, not physical-phone GPU frame timings. No60fps guarantee. Evidence in qa-results/physical-combat/frame-samples.json. Videos before.webm/after.webm are actual independent animation fixtures with placeholder card artwork; they are not a complete PvP gameplay video. Startup white frames in the recording are initial blank-page capture, not a combat flash.

## Remaining scope, explicitly incomplete

- Intro: previous shipped pair-dialogue and fallback changes retained. Full production missing-portrait cause still unconfirmed. No new intro fix in this increment.
- Intermittent blue/purple board: still unreproduced; no speculative color override added.
- Physical champion portrait recoil, confirmed-death transition into leave animation, armor/immunity/audio distinctions, lifesteal flow, summon/awakening/KO redesign remain to be completed.
- New full impact sound family, listening/mix review, audio output latency, consecutive-match cleanup and physical-device profiling remain.
- Main/decks/collection/shop/rewards/tower/draft/settings/navigation overhaul remains. Existing prior work preserved; this increment does not count those screens as redesigned.
- Actual PvP/AI/quick AI/draft/tower/test-match regressions, reconnect, drag during camera, canceled targets, rewards/economy and full start-to-result flow unverified in this increment.

Next implementation gates: reproduce outstanding visual bugs using actual affected state; verify physical contact inside shared gameplay UI; author and review differentiated impacts; refine death/summon/champion sequences; then inspect each nonbattle user flow. Do not label the overall AAA-quality request complete from these changes.
