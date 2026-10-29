# Six connected battle visuals

User authorized all six proposals: damaged champion frames, directional hit traces, turn handoff, champion awakening silhouette, summon landing shadow, and battlefield-continuous results. Implemented on the existing feature branch in the real shared battle/result components.

## Applied

1. `ChampionPortraitFrame` shows shallow rim cracks at<=65% max HP, deeper cracks at<=35%, critical cracks at HP1–5/0. Healing updates the same health-driven chrome. SVG is limited to structural frame damage, with no face/health overlap or pointer target. Both battle and admin preview use this shared frame. After confirmed defeat, the original aperture becomes a faint grayscale remnant after the existing glass-burst interval; the original shatter code is unchanged.
2. Existing `BattleVfxDirector` now adds an authored Kenney `scratch_01.png` contact trace for strength>=5, rotated with the actual contact direction. It fades within950ms. Existing contact dust ends at640ms; no additional sound. Existing bounded four-effect budget, event dedupe, reduced-motion, resize and visibility cleanup remain. Source file: `public/vendor/kenney/particle/scratch_01.png`, Kenney Particle Pack CC0, license alongside in `LICENSE.txt`. No new external download required.
3. `BattleTurnHandoff` observes authoritative turn/active-player changes and briefly highlights the active field edge and gold panel for650ms. Initial mount/reconnect/new match do not replay a handoff; hidden/finished matches do not trigger one. Reduced motion uses a200ms static outline. Two pointer-transparent boxes; no continuous glow.
4. Existing AWAKEN motion draws a temporary silhouette mask from the currently displayed equipped-skin image, using the existing accent inside the clipped portrait aperture. Existing pose/ink emphasis remains. No board-wide theme color or newly invented champion symbols. Reduced motion suppresses this decorative echo.
5. Existing wrestler `CardPlayAnimation` owns a separate elliptical landing shadow at the actual target slot. It narrows on approach, spreads at the same landing clock, settles and clears with the flight. Uses the existing duration/timeline and cleanup on resize/unmount. No extra input lock, audio or engine event.
6. Result overlay initially preserves the mounted finished battle: verdict sits over the former turn bar, rewards/details/continue over the hand strip. Both champion HUD positions remain visible. All existing reports/MVP/highlights remain accessible through the44px details toggle. Reward pending/success/error, retries, quest errors, next action, tower label and modal keyboard focus trap remain. Details can be closed to view the battlefield again; continuation is available immediately. No new forced wait or changed rewards.

## Validation

- Frontend typecheck/build passed.
-120 motion/event/skin/impact/VFX/card geometry/combat tests passed, including landing-shadow clock and cleanup endpoints.
- Chromium390×844 and1440×900: actual shared battle component; real engine END_TURN, champion damage8, hand-to-field summon and lethal damage; all six new visual elements verified, finite cleanup, details toggle and continue verified. Quest completion uses a confirmed-event snapshot fixture, not a complete live quest run.
- Reduced-motion checks: no contact trace or awakening echo.
- Result regression at360×740,375×812,390×844,412×915,768×1024,1440×900,844×390: victory/defeat, CTA bounds, details/MVP/highlights, pending reward without invented credit, retry callbacks, tower continue label, empty result and keyboard containment passed. Initial check discovered the new details button was overflowing the old flex footer; corrected to two-column grid and rerun successfully.
- Existing eight-viewport layout/no-scroll/portrait ratio/emote-gold assertions passed. Real touch input script at393×760 passed (including info-corner drag, champion targeting, illegal/cancelled drops).
- Local QA fixture uses explicitly labeled diagnostic sprites. Screenshots are actual shared components with fixtures, not final character art. No physical-device GPU/FPS measurement, production admin write, fresh two-client PvP or full AI/tower/draft campaign performed. No controlled user study; satisfaction/impact improvements are design hypotheses.

No card/champion stats, combat/quest rules, server authority, player data, economic policies or source artwork changed. No main merge, DB migration or API deploy.
