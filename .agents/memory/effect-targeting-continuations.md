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

Automatic effects must advance the active frame before applying their body so nested damage and trigger resolution cannot re-enter the same unresolved effect.

**Why:** An automatic `ALL` damage effect can invoke a nested resolver while its original frame is still current; without the advance, resolution recurses indefinitely.

**How to apply:** Treat automatic effect execution like a completed selection: apply it against a frame whose `effectIndex` already points to the next effect, then let child continuations resume through the normal stack.

Trigger callers must only resume a pending frame when `resolveTriggeredAbilities` installed a new child state; a no-op trigger can otherwise mistake the active parent frame for its own resolution.

**Why:** Lethal damage inside a paused effect caused a no-op `BEFORE_RETIRE`/`BEFORE_DAMAGE` lookup to replay the parent continuation and discard the retired card's aggregate follow-up data.

**How to apply:** Compare the returned state with the trigger input before calling `resolvePendingEffects`; preserve the existing active frame when the trigger returned the same state.

Retirement-trigger resolution can clear the child frame while leaving the original targeted effect's parent frame as the only continuation; the parent must be restored before resolving the next effect.

**Why:** Lethal DAMAGE followed by an aggregate effect otherwise stops after retirement, so the next effect never runs even though the card was removed correctly.

**How to apply:** When a lethal retirement resolver returns without a targeting frame, retain the caller's frame, carry the retirement snapshot through the event/resolution state, and resume the parent through the common resolver.