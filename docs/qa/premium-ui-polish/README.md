# Premium UI polish — first measured increment, incomplete

No production deploy, main merge or production DB access. Branch: feat/premium-ui-polish.

## Diagnosis and priorities

1. Battle interaction states: the board stylesheet had no dedicated focus-visible treatment. Add consistent gold focus outline to central controls, ability and emote buttons, stationary pressed feedback, disabled cursor and tabular turn numerals. Existing browser focus behavior was not measured before modification; do not claim it was completely absent.
2. Preserve existing successful geometry: six rendered viewports showed no horizontal overflow. Settings/log are already 44×44 and end-turn 82×44, so no blanket resizing was justified. Before/after geometry is identical.
3. Pending high-priority inspection: actual-art HUD and quest crowding, emote overlay placement, hand drag vs scroll, deck filter/remove/share flows, collection ownership, shop purchase confirmation, matchmaking/cancel, tower rewards. These have NOT been audited or polished in this increment.

Principles applied: consistent feedback and predictable focus location; preserve spatial grouping and touch geometry rather than redesigning working layout. Scope is battle-board.css only; no card frame, artwork, effect text, keyword indication, animation engine or gameplay change.

## Existing system

Reuse existing board palette variables (board-bright/gold/panel/muted), NeoDunggeunmo typography, dark wood and fabric assets, shared buttons and current 44px central controls. No additional design token system, new theme or animation loop.

## Executed verification

- Rendered local shared battle fixture at 360×740, 375×812, 390×844, 412×915, landscape 844×390, desktop 1440×900.
- Six before and six after full-page PNGs, measurements in before.json/after.json. All show no horizontal overflow and identical central-control dimensions.
- Full workspace typecheck and production build passed.
- Mobile testing is emulation. Fixture has placeholder card art/empty champion portraits; these captures do NOT verify skins, real-art presentation or full production game states.
- No real user study, task-time comparison, physical phone, live PvP, or full drag/scroll/modal regression performed. Focus/pressed-state CSS is implemented but keyboard/touch behavioral assertions remain outstanding.

This is an initial isolated increment, not completion of the requested all-screen UI/UX polish. Do not deploy or merge it as a finished redesign.
