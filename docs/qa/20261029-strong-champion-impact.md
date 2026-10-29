# Visible breathing, damage-driven recoil and stronger whole-board shake

Feature branch only, frontend presentation only. No card/champion data, combat, quest, reward, account or DB changes. Existing global impact manager is reused; no new parallel camera system.

## Changes

- Idle breathing: base 6px / 3.6sec, with slight 1.2% uniform breathing scale. Low-health breathing: base 4.5px / 4.6sec with 0.6% scale. Both retain per-character phase/speed/movement settings; low-health posture stays slumped. Removed the old CSS override forcing low-health movement to only 0.5px. Small mobile portraits use the existing 0.8 motion floor instead of reducing breathing below one pixel.
- Confirmed damage drives torso force within each band: 1–4 damage grows from a base force of 12 to18; 5+ starts at28 and grows by3 per damage point. Previous forces were6/14 regardless of damage. Heavy rotation also increases with damage. Non-hit gesture strength remains unchanged. Only decorative body layers move, with per-axis caps52px/48px and rotation10degrees; no cumulative offsets or pending queue.
- Global damage impact now scales per damage point, rather than plateauing at band values. Damage5 is HEAVY. Amplitude caps at42 (previous22); camera displacement cap92px (previous58). Current contact zoom is preserved. Increasing damage strengthens the directional initial kick, reverse recoil and decaying tail.
- Removed champion-effect-hit override reducing all strong-hit screen requests to amplitude3 and130ms. All confirmed non-basic hit reactions now request the shared damage profile; the manager arbitrates competing events. Basic attacks keep their existing contact-timed single global request and automatically use the stronger shared profile. Self damage keeps its weaker body recoil but uses the real applied damage for camera strength.
- Damage0 produces no hit/shake. OFF suppresses global shake; reduced-motion suppresses body displacement, breathing and global shake. No option is forcibly enabled.

## Actual browser measurements

Shared real battle component with local engine `applyEffect`, confirmed damage events and selected-skin diagnostic sprites. Measured over rAF frames; CSS individual translate and sprite transform are sampled separately.

|390×844|Torso peak (px)|Whole-stage camera peak (px)|
|---|---:|---:|
|0 damage|0|0|
|1|16.43|17.78|
|2|19.16|23.71|
|4|24.63|39.52|
|5|40.12|51.38|
|8|48|69.16|
|12|48|82.99|

Five-damage torso movement was approximately20px before this change. Extreme damage is intentionally capped; growth is not unbounded.

- Mobile idle breathing range4.80px; low-health3.60px. Desktop ranges6.00px/4.50px.
- Desktop1440×900 damage5 torso50.15px/camera67.60px; damage12 camera92px cap.
- OFF: camera0 with body still active. Reduced-motion: body/camera/breathing0.
- 98 sprite/events/skin/policy/combat/retirement regression tests passed. Typecheck and production build passed.
- 390×844 genuine touch field attack/target/cancel/illegal-target/info/drag-ghost cleanup suite passed after the changes. This suite runs reduced-motion; it does not prove touch accuracy during maximal camera movement.
- Physical Android/iOS, internet two-client PvP, every separate mode campaign, final uploaded artwork crop and human comfort evaluation are not newly tested. Temporary diagnostic sprites were used in browser recordings. `mobile-silent.mp4` contains actual local battle execution and no audio. The screenshot is an after-hit resting frame, not a claim to depict the peak frame.

## Main files

- `artifacts/ko-game/src/components/champion-sprite-motion.ts`
- `artifacts/ko-game/src/components/champion-sprite-visual.tsx`
- `artifacts/ko-game/src/components/champion-sprite-visual.css`
- `artifacts/ko-game/src/components/screen-impact-policy.ts`
- Their motion/policy test files.
- `docs/qa/strong-champion-impact-browser.mjs`

Deployment is recorded separately. No main merge or API redeploy required.
