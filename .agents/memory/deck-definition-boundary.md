---
name: KO deck definition boundary
description: User decks store only definition references, while live published status is resolved when decks are read or selected.
---

KO decks keep the owning user ID, Champion Definition ID, and card Definition ID array rather than copying card or Champion data. A deck is valid only when its current references are published, allowed definitions and its card count is 20–30.

**Why:** Card Admin can disable or remove definitions after a user saves a deck; silently replacing a reference would change the player's saved plan and could cross the ownership boundary.

**How to apply:** Resolve references from the current database snapshot for deck UI and future match-start code, and derive the current user from the authenticated server session for every deck mutation.