---
name: Mixed-owner target scopes
description: Runtime rules for structured effects that can target cards on both sides
---

An `ALL` card target scope must resolve each selected instance against its current owner before applying the action; it cannot be treated as an alias for `ENEMY`.

**Why:** Damage, retire, move, and related actions use the target owner to locate the candidate player. Treating a mixed selection as enemy-only makes allied team-kill selections validate in the UI but fail during resolution.

**How to apply:** Keep `ALL` in valid-target projection, then delegate each chosen instance through the existing SELF or ENEMY path. Source-attributed Champion quests should match the causing ability/player even when the retired card belongs to the opponent.