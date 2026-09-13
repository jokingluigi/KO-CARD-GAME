---
name: Collection and pack boundary
description: Collection ownership and pack reward semantics for KO progression
---

Collection ownership is authoritative for deck editing: published definitions alone are not enough to make a card or Champion selectable. Pack rewards use separate NORMAL_CARD, LEGENDARY_CARD, and CHAMPION_UNLOCK categories; Champion unlocks are never represented as Champion-rarity cards. Pack inventory is separate from definitions, and opening must conditionally decrement inventory in the same transaction that persists rewards.

**Why:** Token definitions and playable Champion definitions share parts of the content model, but they have different ownership and deck eligibility rules. Conditional inventory updates prevent double-spend when the client repeats an opening request.

**How to apply:** Keep server-side ownership checks on collection reads, deck writes, representative-deck selection, and pack reward writes. Validate pack probabilities and non-empty eligible pools before publishing or opening. Never let reveal timing control persistence.