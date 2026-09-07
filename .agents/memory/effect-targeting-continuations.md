---
name: Effect targeting continuations
description: Durable ordering rules for KO effects that pause while the player selects targets.
---

PLAYER_CHOICE effect resolution is an engine-owned, serializable continuation stack. UI state must not own pending effects or preselect targets before a trigger occurs.

**Why:** A single pending-effect slot loses later abilities, deferred position effects, or nested leave effects when a targeted effect pauses or destroys another card.

**How to apply:** New triggers and abilities must enter the common ordered resolver. Nested triggers push a child frame, target completion resumes exactly one frame, and all selected IDs are revalidated by the engine before execution.