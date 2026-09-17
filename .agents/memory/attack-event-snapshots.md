---
name: Attack event snapshots
description: Combat presentation needs immutable attack card data when a target may leave the board during resolution.
---

Attack presentation should use the attack event's source/target snapshots first, then live instance DOM positions, then the last measured card position. Combat events must retain the attacker and target instance IDs, card types, board slots, and relevant stats so UI animation does not depend on the post-resolution board.

**Why:** A lethal attack can remove the target before the client renders the next state, making current board lookups and slot coordinates stale or empty.

**How to apply:** Preserve this fallback order for player and opponent attacks; do not re-resolve presentation targets from current board slots after combat.