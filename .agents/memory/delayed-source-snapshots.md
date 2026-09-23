---
name: Delayed source snapshots
description: Rules for delayed effects whose registering card can leave the board before execution
---

Delayed effects need a serializable source-card snapshot because the registering instance may be retired before the scheduled effect fires. `OWNER_NEXT_TURN_START` and `OPPONENT_NEXT_TURN_START` must calculate the next matching player turn from the active player at registration, not from a fixed player-count offset. If a delayed REVIVE feeds a `SAME_TARGET` follow-up, pass the actual revived instance IDs forward.

**Why:** A delayed effect registered during the other player's turn can be due on the immediately following turn, and source lookup from the live board otherwise silently drops the effect.

**How to apply:** Preserve the snapshot through state persistence/reload and derive continuation targets from the state transition produced by the queued effect.