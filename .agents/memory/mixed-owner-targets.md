---
name: Mixed-owner target scopes
description: Runtime rules for structured effects that can target cards on both sides
---

An `ALL` card target scope must resolve each selected instance against its current owner before applying the action; it cannot be treated as an alias for `ENEMY`.

**Why:** Damage, retire, move, and related actions use the target owner to locate the candidate player. Treating a mixed selection as enemy-only makes allied team-kill selections validate in the UI but fail during resolution.

**How to apply:** Keep `ALL` in valid-target projection, then delegate each chosen instance through the existing SELF or ENEMY path. Source-attributed Champion quests should match the causing ability/player even when the retired card belongs to the opponent.

Strict validation must also preserve `ALL` across a chained `SAME_TARGET` consequence when the prior effect selected one unrestricted board wrestler; require the matching preceding choice rather than allowing standalone `ALL`/`SAME_TARGET`.

**Why:** A chosen mixed-owner target can be removed by a later linked effect, and rejecting its causal chain at save time makes valid text fail even though runtime resolves the instance through its actual owner.

**How to apply:** Validate the zone, card type, and matching count against the preceding `PLAYER_CHOICE`; keep ordinary owner restrictions and unknown-target checks unchanged.