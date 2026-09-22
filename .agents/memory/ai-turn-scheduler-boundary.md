---
name: AI turn scheduler boundary
description: AI turn execution must remain independent from presentation cleanup and timeout fallback.
---

The AI scheduler owns a canonical `GameState` loop and applies each successful legal action to that evolving state. Presentation queues may delay the next decision, but their React cleanup must not cancel the scheduler merely because a cosmetic busy flag changed. Timeout fallback must read the latest canonical state, use its active player, and dispatch the same `END_TURN` boundary without restoring zones or bypassing pending target choices.

**Why:** A stale React closure could end an older state, moving board cards backward and making a defeated AI Champion appear to recover. Presentation-driven effect cleanup could also strand an AI turn after a quest or ability animation.

**How to apply:** Keep scheduler cancellation tied to turn/status lifecycle, not presentation state. Use latest-state refs for timer callbacks, preserve unresolved `PLAYER_CHOICE`, and clamp lethal HP only when rendering.