# Legendary speech: bounded lifetime and upper-screen overlay

## Reproduced regression

The previous presentation component owned its removal timer. Settings, selection, or another conditional UI could unmount that component while leaving its event queued. Its timer was cancelled, and mounting it again started a fresh full timer. A browser regression reproduced the old failure: summon a real legendary, open settings, wait beyond its lifetime, close settings; the expired speech returned (assertion failed with 1 remaining panel).

## Fix

The shared battle event queue now owns the active ready speech's deadline, independently of presentation visibility. Hiding/remounting the view cannot restart it. Visibility/pageshow resume checks also remove an overdue event. Timers and listeners clean up on event or match changes. Consecutive summons still advance in FIFO order. The ordinary 2600ms ribbon duration is retained; legendary entrances use 2200ms, or 2800ms for long dialogue.

Legendary dialogue now floats near the viewport's top, entering downward and fading/moving upward on exit. It does not track the opponent field or board camera. Original art/skin, speaker name and full quote are retained. On scrolled desktop/landscape views it moves below visible turn controls to keep those usable. It can briefly cover the opponent's upper HUD as an entrance overlay. Tapping dismisses safely; outside input continues normally; attacks and techniques retain priority. Reduced motion uses the same bounded lifetime without movement.

No card/champion data, battle rules, server logic, audio or DB changes.

## Validation

- Added `legendary-dialogue-expiry-browser.mjs`: actual play and landing, upper viewport placement, full long text, automatic DOM removal without input, expiry while settings is open, no resurrection after close or same-snapshot reload, no authoritative state mutation; mobile 360×740, 375×812, 390×844, 412×915, desktop 1440×900, landscape 844×390, reduced-motion 390×844.
- Updated existing distinct/long browser assertions for upper-screen positioning, preserved live-control separation, full quote, inside/outside touch, incoming attack dismissal, two-speaker FIFO and champion/artwork-dialog priority.
- Full typecheck/build and 30 scoped event/presentation/KO/quest policy tests.

All validation groups listed above passed on the final revision. No physical device/user study or exhaustive live draft/tower matches. No claim of measured satisfaction improvement.

Before: [field cut-in](screenshots/20261027-legendary-spotlight/after-390.png). After: [upper-screen entrance](screenshots/20261027-legendary-top/after-390.png).
