---
name: Effect targeting continuations
description: Durable ordering rules for KO effects that pause while the player selects targets.
---

PLAYER_CHOICE effect resolution is an engine-owned, serializable continuation stack. UI state must not own pending effects or preselect targets before a trigger occurs.

**Why:** A single pending-effect slot loses later abilities, deferred position effects, or nested leave effects when a targeted effect pauses or destroys another card.

**How to apply:** New triggers and abilities must enter the common ordered resolver. Nested triggers push a child frame, target completion resumes exactly one frame, and all selected IDs are revalidated by the engine before execution.

Automatic effects that create new card instances must store the created instance IDs in the same resolution frame before the next effect consumes `SAME_TARGET`; cost filters on existing instances use current cost, while definition-pool filters use printed cost.

**Why:** Re-deriving targets from the board after nested resolution can include the source or lose the exact generated cards, and using printed cost rejects cards whose live cost was reduced.

**How to apply:** Creation handlers should return their produced IDs through `lastTargetIds`, and instance target resolvers should compare `currentCost`; keep definition candidate filters on `definition.cost`.