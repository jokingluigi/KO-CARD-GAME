---
name: Champion ability turn limit
description: Runtime rule for limiting Champion active abilities to one use per player turn.
---

Champion active abilities are limited by game state, not only by the button state: each player tracks whether their Champion ability was used during the current turn, the engine rejects a second use, and the flag resets when that player's turn begins.

**Why:** UI-only limits are bypassable and would allow duplicate gold spending/effects from direct engine calls.

**How to apply:** Check and set the player-level flag in the Champion ability action, reset it in turn initialization, and expose the same state to the UI for disabled controls and messaging.