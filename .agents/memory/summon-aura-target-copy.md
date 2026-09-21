---
name: Summon aura and target-stat copy
description: Generic summon effects use explicit summon listeners and snapshot selected target stats before creating the summoned instance.
---

Summon-only auras should use the shared `CARD_SUMMONED` trigger, target the summoned instance through `SAME_TARGET`, and apply normal tag filters. A summon that copies a random graveyard target's stats must snapshot that target before creating the new card; the resulting card remains a normal generated summon.

**Why:** Reusing `ENTER_FIELD` for board auras confuses the aura source with the summoned card, while copying after creation loses the selected target's current stats.

**How to apply:** Add future summon reactions to the trigger registry and dispatch them after `SUMMON` entry. Represent source-card stat copying and selected-target stat copying as separate generated-modifier semantics.