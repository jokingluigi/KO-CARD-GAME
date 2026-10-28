# Mobile field size and battle pointer repair

Branch: `feat/final-sprite-reactions-review`. Presentation/input only; no game rules, card/champion definitions, data, rewards, or server changes.

## Changes and causes

- Portrait mobile hand strip is now `clamp(92px,15dvh,136px)` rather than 196–224px. Remaining vertical space enlarges both four-slot fields. Commander size/position, automatic opponent mirror, desktop and landscape geometry stay intact.
- A short-screen `:has(context cancel)` rule previously restored the older hand height upon selection. The new height has identical specificity for idle and selected states, so field bounds no longer change underneath a drag.
- At 390×844, field cards increase from 71.2×99.7 to 90.5×126.7 CSS px (about 1.27× linear / 1.62× area); hand cards become 70.4×98.6px.
- In-board effect-text links used `stopPropagation()` and opened keyword/card dialogs instead of selecting the field card. Board text now forwards input to the normal card action. Detailed keyword links remain in the inspector; ALT and the explicit information button remain available.
- The invisible 44×44 information square covered much of small field cards. Field information now uses a visible-corner 24×24 target (deliberate smaller secondary target); the hand information control is unchanged.
- Field cards use `touch-action:none`, preventing browser pan/pointer cancellation during vertical attacks. The independently scrolling hand retains its prior policy.

Four cards must fit without overlap. A literal 1.5× increase in each dimension is impossible at some portrait widths; expansion is capped at the available width. This is not reported as 1.5× everywhere.

## Validation

- Shared real battle UI with actual local engine actions and CDP touch events, not a static mockup. Test: `docs/qa/field-size-input-browser.mjs`.
- Seven viewports (each independent scenario starts a new isolated match; no production requests): 360×640, 360×740, 375×812, 390×844, 412×915, 844×390, 1440×900. Checks field bounds unchanged after selection, normal effect-text taps, explicit information availability, field-to-field and champion attacks, cancel/outside drops, illegal attack rejection, no overflow or page exceptions. The six touch viewports passed together; desktop passed in an independent run after repairing the QA script’s Escape-cancel branch (it had incorrectly attempted to close an inspector).
- Existing `mobile-spell-drag-browser.mjs`: 360×740,375×812,390×844,412×915,1440×900 passed. Actual touch/mouse casts, player-choice targeting, selected Use-button drag, cancellation, invalid casts and horizontal hand scrolling.
- 55 engine/sprite/motion regression tests passed. Frontend typecheck and production build passed.
- Before/after screenshots use historical local catalog fixtures without production artwork; image absence in these fixtures is not a sprite rendering claim.
- Not tested: physical Android/iOS hardware; a new live internet two-client PvP session; production account changes. All modes share the edited battle UI, but no separate full AI/PvP/tower/draft campaign was run.

Deployment receipt is recorded separately. Production database untouched; main not merged.
