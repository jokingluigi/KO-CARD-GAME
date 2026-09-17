---
name: Generic stat pipeline
description: Durable rules for shared COST, ATTACK, and HEALTH modifiers, events, history, and nested listeners.
---

Generic COST, ATTACK, and HEALTH changes should use one signed/set modifier pipeline. Every applied change records before/after/delta in both stat history and a common STAT_CHANGED event, including duration and source attribution when available. Health stat changes are not damage: board changes update current and maximum health together, then state-based retirement handles lethal results.

**Why:** Compound effects and card listeners can otherwise drop later modifiers, conflate damage with health reduction, or make ALT details inconsistent across stats.

**How to apply:** Keep old action payloads readable for compatibility, map new natural-language stat forms to generic modifiers, and when an automatic listener fires during an unresolved effect chain, execute it without replacing the parent frame and restore that frame before continuing. Temporary THIS_TURN modifiers expire at the acting player's turn end; UNTIL_NEXT_TURN expires at that player's next turn end.