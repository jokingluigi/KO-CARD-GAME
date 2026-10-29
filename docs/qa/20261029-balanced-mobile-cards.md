# Rebalance mobile champions, fields and hand

User requested preserving the tall frame aspect ratio while reducing the whole portrait, enlarging both field and hand, and removing the emote/gold overlap. The previous no-scroll release overallocated vertical space to the commanders.

Changes in the actual shared battle CSS:
- Portrait HUD height clamp(136px,22dvh,190px); width is height×0.8625, preserving the approved 179.4:208 frame proportion. No artwork crop, image display settings or reaction motion changes.
- Hand strip clamp(112px,16dvh,148px), remaining space divided between field rows. Selected/unselected layouts use the same budget.
- Emote control stays in normal flow in a dedicated44px heading row, gold in the next44px row. Enemy guidance moves down to start after gold. No absolute icon overlay on the resource panel.
- Admin390×844 frame preview matches actual185.68×160.149 geometry. PC/landscape unchanged.

Measured393×760 before→after: portrait180.77×208→144.2×167.2; field61.6×86.2→79.4×111.2; hand44.3×62→66.8×93.6. Portrait is20% smaller on both axes. At390×844 the field remains its width-constrained90.5×126.7 size and the hand grows46.3×64.8→76.5×107. At360×740 field grows54.4×76.2→76.6×107.2.

Browser geometry assertions passed at393×760,360×640,360×740,375×812,390×844,412×915,844×390,1440×900, then resizing the same page back to393×760: no document/battle vertical overflow; mobile portrait ratio correct; emote44px and bottom not overlapping gold; field width>=58px and hand height>=84px. Actual shared game component with read-only API fixtures, not an admin-only mockup. Screenshot fixture has no registered character artwork, so it verifies layout, not final sprite composition.

Production frontend build passed. Field touch/mouse selection, drag-to-unit/champion, invalid/cancelled drops, information panel, and stable selected-field dimensions passed across all eight sizes. Hand/info-corner drag, Use action and horizontal hand scrolling passed at360×740,375×812,390×844,412×915,1440×900. Initial390×844 ordinary-tap test timed out after its preceding outside drag; final recheck passed after the independent scenario waited500ms for the existing450ms compatibility-click suppression. No production input-handler changes. Logs summarized in input-checks.json. No rules, engine, network, champion/skin data, original art or DB changes. Physical-device and fresh two-client PvP validation not run.
