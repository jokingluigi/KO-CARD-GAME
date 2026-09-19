---
name: Technique trigger boundary
description: How published Technique card effects must be triggered when a card is migrated from a wrestler definition
---

Hand-played Technique cards resolve their own effects through the generic `ACTIVE` path. `ENTER_FIELD` is the wrestler deployment trigger; leaving a migrated effect there can make the card move to the graveyard without executing its intended effect.

**Why:** The shared Technique engine removes the card from hand and resolves ACTIVE effects, while it never enters the card into a board slot or fires ENTER_FIELD for it.

**How to apply:** When normalizing a published card from WRESTLER to TECHNIQUE, preserve its actions and target filters, but validate and migrate entry-only triggers to ACTIVE when the card is meant to be cast from hand. Do not add a name-specific runtime branch.