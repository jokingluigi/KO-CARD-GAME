# Single dragged card and portrait frame trim

- Removed portrait-image `emblem` input from the shared frame and both actual battle callers. Its narrow metal side hinges now contain no character image, in game or admin preview. Other portrait art and frame geometry are unchanged.
- Dragged hand originals now use zero opacity instead of 28%; the original retains layout and pointer capture. Only the pointer-following clone is visible. The actual hand is updated by the existing validated action, not by cosmetic dragging.
- On cancelled normal-motion drags, keep the original hidden during the 160ms return and restore it when the clone is removed. Restarting a drag clears that card's previous return clone. Match change/unmount removes return clones, timers and hidden markers.

Checks: frontend typecheck and production build passed. Actual shared battle browser/engine flows passed at 360×740, 375×812, 390×844, 412×915 and 1440×900, using normal motion and CDP touch on mobile. Assertions cover source opacity zero while clone remains visible, retained source layout, spell use and target selection, cancellation restoration, illegal/outside drops, horizontal hand scrolling, no leftover ghosts/hidden markers and no images in all four frame hinges. Separate wrestler/field input regression passed at 393×760.

[Diagnostic drag screenshot](screenshots/20261029-single-card-drag/drag-390.png). The QA fixture has no final champion artwork; the screenshot is for drag visibility/layout, not final character-art validation. Physical phone and live authenticated PvP were not exercised.

Changed: shared `champion-portrait-frame.tsx`, battle callers in `game-state-preview.tsx`, `battle-card-drag.tsx`, `battle-presentation.css`, and `mobile-spell-drag-browser.mjs`. No combat rule, server or database changes.
