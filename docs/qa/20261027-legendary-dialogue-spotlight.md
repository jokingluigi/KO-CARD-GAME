# Legendary entrance dialogue spotlight — 2026-10-27

The previous 42px command-row ribbon made legendary entrances read as routine notices. LEGENDARY ENTER_FIELD dialogue now uses a large illustrated spotlight, positioned over the opposite visible field when possible. Champion speech remains attached to its HUD; ordinary wrestler/leave-event dialogue remains a compact ribbon.

## Implementation

- Existing original/equipped skin artwork, framing metadata and original-image fallback are reused. Large speaker name, complete quote, rarity and own/opponent identity establish hierarchy without changing dialogue data.
- Width is viewport-bound (maximum 760px); height follows the visible field, up to 210px. Long quotes fit down to a 12px floor. Actual tested 46-character Korean dialogue remained readable at 14.28px or larger.
- Directional entrance/settle/exit; reduced-motion preference disables movement. Duration is 2200ms, or 2800ms for longer quotes.
- No presentation lock or timer changes. Outside input dismisses and continues to its original target; tapping the spotlight consumes that tap to prevent clicking a concealed card. Pointer cancellation clears the spotlight. Attacks and technique animations take priority and remove a ready entrance spotlight.
- Settings, log, emote and graveyard views suppress dialogue. Layer 232 stays below combat VFX and artwork dialogs. The spotlight temporarily covers a field area, not resources, hand, ability or turn controls.
- No new runtime image or sound files. No engine, card/champion data, server, schema or economy changes.

## Actual validation

- Typecheck and full workspace build: passed.
- 30 scoped existing policy/event/KO/quest tests: passed.
- `distinct-dialogue-browser.mjs`: passed at 360×740, 375×812, 390×844, 412×915, 1440×900 and reduced-motion 390×844. Actual play/landing precedes dialogue; full quote, artwork, bounds, critical-control separation, two-speaker FIFO, next-card selection, cancel and no replay/state mutation checked. Artwork dialog hit-test remains above speech.
- `legendary-spotlight-long-browser.mjs`: passed long published-card dialogue at the first three mobile sizes and 844×390. Actual touch inside/outside, keyboard dismissal, no click-through or game-state mutation, and incoming actual attack interrupt checked.
- Existing champion KO dialogue browser suite: passed both outcomes at actual HUD shatter, no duplicate result speech, reconnect and input release.
- Existing champion quest dialogue browser suite: passed at mobile/desktop and reduced motion.
- Existing cosmetics browser suite: all eight groups passed, including two real authenticated local PvP sessions, reload, equipped skins/emotes, failed-image fallback and actual AI setup/start.

## Evidence and limits

Before: [small ribbon](screenshots/20261026-dialogue/legendary-390.png). After: [390×844 illustrated spotlight](screenshots/20261027-legendary-spotlight/after-390.png).

Browser checks use the real shared frontend and engine, with QA fixtures. No physical-device or user study was performed; perceived prestige/readability is a design hypothesis, not a measured satisfaction claim. Full live draft/tower runs and every card dialogue were not individually tested. Audio is unchanged. Existing unrelated broad hosted-CI failures are not represented as passing.

## Changed files

- `artifacts/ko-game/src/components/legendary-dialogue-spotlight.tsx` and `.css`: illustrated adaptive presentation and safe lifecycle/input handling.
- `artifacts/ko-game/src/components/wrestler-dialogue.tsx`: legendary-entrance routing, existing ordinary ribbons retained.
- `artifacts/ko-game/src/components/game-state-preview.tsx`: field refs, portal placement, action/modal priority; existing interaction handlers retained.
- `docs/qa/distinct-dialogue-browser.mjs`: actual larger spotlight and interaction regression assertions.
- `docs/qa/legendary-spotlight-long-browser.mjs`: long text and touch/attack-priority coverage.
- This report and after screenshot: review evidence.
