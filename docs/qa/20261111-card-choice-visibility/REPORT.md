# Card-choice visibility — 2026-11-11

The board target-selection SVG used z-index 190 while the card-choice modal used z-index 50. Catalog discovery and multi-target choices kept that SVG active, so its 38% black mask covered the dialog and its cards in addition to the dialog's own 80% background dimmer.

The exact same condition now owns both opening the modal and suspending the board spotlight. Card-choice content uses layer 201 above its single 50% black backdrop at layer 200. Cards, text and enabled confirmation buttons retain their own full brightness. Direct battlefield targeting retains the existing spotlight and original hitboxes. No game effects, choice candidates, rules or API/schema changed.

## Actual verification

- Reproduced before the change in two real online battle pages backed by the real online service and isolated PGlite DB.
- After patch: same accepted spell/ability actions, catalog discovery, card selection/confirmation, multi-target selection, opponent waiting, and persisted selection after reload passed at 390×844, 844×390 and 1440×900.
- Visibility checks assert no battlefield mask behind the active modal, content above backdrop, full content opacity after the opening animation and one 50% backdrop. Initial QA assertion sampled the opening fade; it was corrected to wait until that animation completed.
- Existing direct-board target checks passed at 360×740, 390×844, 740×360 and 1440×900: eligible holes only, input pass-through, resize/cancel, actual spell use and champion ability targets.
- `pnpm build`: passed, including type checks. Existing Rollup circular chunk warnings remain; no new runtime errors occurred in these browser scenarios.
- Browser tests used temporary/placeholder artwork and real production UI components. They do not validate every production image or every game mode. No Production DB writes or production match creation.

Before: `before/discovery-390.png`. After: `after/discovery-selected-390.png`, `after/discovery-selected-844.png`, `after/discovery-selected-1440.png`. Authoritative browser results: `after/results.json`.

## Files

- `artifacts/ko-game/src/components/battle-card-choice-dialog.tsx`
- `artifacts/ko-game/src/components/game-state-preview.tsx`
- `docs/qa/balance-content-20261111-browser.mjs` (expanded visibility assertions)

Release receipts are added after deployment. API changes are not required for this frontend-only patch.
