---
name: KO deck definition boundary
description: User decks store only definition references, while live published status is resolved when decks are read or selected.
---

KO decks keep the owning user ID, Champion Definition ID, and card Definition ID array rather than copying card or Champion data. Read current construction limits from the shared game-engine rules; do not rely on stale numeric summaries or silently replace invalid references.

**Why:** Card Admin can disable or remove definitions after a user saves a deck; silently replacing a reference would change the player's saved plan and could cross the ownership boundary.

**How to apply:** Resolve references from the current database snapshot for deck UI and future match-start code, enforce copy limits at both the API boundary and editor controls, and derive the current user from the authenticated server session for every deck mutation.

Editor validation must treat saved server errors as evidence for the saved card/champion reference snapshot only; once the draft changes, recompute from the draft and do not carry those errors forward.

**Why:** Server validation is authoritative for ownership and persisted references, but displaying its old result after an unsaved edit makes a now-valid draft look invalid.

**How to apply:** Compare the current draft references with the opened deck before including persisted invalid reasons; always keep local count, rarity, status, and Champion checks live.