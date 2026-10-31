# Restore named-card references before a match

## Cause

CardRulesText already split recognized card names into interactive links and rendered an existing information dialog. It resolved names only through the global runtime match catalog. That catalog is populated during match setup and cleared by some exits; collection/deck detail dialogs can render without it. As a result, real published names were ordinary text until a match had loaded those definitions. This reproduces without deleting or hiding the old dialog system.

Before: an empty runtime catalog with text naming the published Zombie card produced zero reference links and zero public-catalog requests on both desktop and mobile.

## Fix

CardRulesText now reuses fetchPublicCardTagCatalog, the existing published-only tag-browser loader and shared request/5-minute cache. Asynchronous catalog arrival updates the text. Names resolve against the union of the public display catalog and runtime definitions, with runtime definitions taking precedence by stable ID for match-specific snapshots. This never writes public definitions into the game engine registry or modifies game state.

Existing keyword help, longest-name-first matching, dialog image/stats/effect rendering, mouse/keyboard/touch activation, dismissal and focus restoration remain in use. Existing noninteractive board text and targeting-priority restrictions are preserved to avoid stealing taps from targeting or drags.

Only PUBLISHED public entries are used by the loader. If the public request fails, existing runtime references and keyword help still work. Unknown cards are not invented.

## Executed checks

- New Chromium desktop/mobile test uses the actual shared CardRulesText/CardDetailDialog components, an empty runtime catalog and Oct30 published-card records in a mocked API response. Zombie and Zombie Dehun links appear after delayed API loading; longest names remain whole. Dialogs display actual published costs/effect text. Nested reference dialog returns to the parent detail; opening/closing does not play/select a card. Desktop Enter/Escape restores focus. Initial multiple rule renderers share one public-catalog request. Existing RelatedCards separately makes its pre-existing requests when the parent detail opens.
- Catalog HTTP 503 case: runtime fixture reference and armor explanation remain functional, no page errors.
- Existing card-rules browser regression passed desktop mouse/keyboard and mobile touch: armor/countdown, card references, action isolation, nested modal, inspector mouse leave, outside close, long press, Escape/focus return.
- Shared real battle UI/local engine touch regression passed at 390×844, 740×360 and 1440×900: summon drag, spell drag/target, cancel preserving state and rotation preserving state.
- Frontend typecheck and production build passed. No gameplay/API/database changes; no main merge.

Runners: `node docs/qa/card-reference-restore-browser.mjs`, `KO_QA_PLAYWRIGHT=file:///workspace/KO-CARD-GAME/docs/qa/black-gold-playwright.mjs KO_QA_ORIGIN=http://127.0.0.1:5186 node docs/qa/card-rules-browser.mjs`, and `node docs/qa/battle-viewport-input-browser.mjs` with local Vite on 5186.

[Before mobile](20261031-card-references/before-mobile.png), [restored mobile popup](20261031-card-references/after-mobile.png), [desktop popup](20261031-card-references/after-desktop.png), [before results](20261031-card-references/before.json), [after results](20261031-card-references/after.json).

Browser tests use real common frontend components and local engine with controlled API fixtures, not a live authenticated collection/deck/PvP session. Physical devices and live-account gameplay were not separately tested.
