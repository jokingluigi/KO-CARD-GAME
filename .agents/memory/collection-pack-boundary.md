---
name: Collection and pack boundary
description: Collection ownership and pack reward semantics for KO progression
---

Collection ownership is authoritative for deck editing: published definitions alone are not enough to make a card or Champion selectable. Pack rewards use separate NORMAL_CARD, LEGENDARY_CARD, and CHAMPION_UNLOCK categories; Champion unlocks are never represented as Champion-rarity cards.

**Why:** Token definitions and playable Champion definitions share parts of the content model, but they have different ownership and deck eligibility rules.

**How to apply:** Keep server-side ownership checks on collection reads, deck writes, representative-deck selection, and pack reward writes. Validate pack probabilities and non-empty eligible pools before publishing or opening.