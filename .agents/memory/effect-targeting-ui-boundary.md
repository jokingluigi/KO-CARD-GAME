---
name: Effect targeting UI boundary
description: Interaction rules for visible PLAYER_CHOICE targeting in the KO match UI.
---

During PLAYER_CHOICE, hand cards, board cards, and both Champion panels must route clicks through the common effect-target handler even when the clicked item is not valid. Only valid items receive the target highlight; invalid clicks must remain deliverable so the UI can show an error while keeping targeting active.

**Why:** Disabling pointer events on non-targetable cards, or clearing the error immediately after a hand-card callback, hides invalid-target feedback and makes hand targeting appear broken even though the engine is correct.

**How to apply:** Keep the engine's valid-target set authoritative, but do not make non-targetable items inert during targeting. Do not clear the error after delegating a pending target click; let the common handler clear it only after a successful selection.