---
name: Aggregated summon stats
description: The reusable resolver contract for carrying current-stat sums from destroyed targets into a later summon.
---

The structured effect engine carries `LAST_DESTROYED_TARGETS` current attack and current health sums inside the active resolution frame. A later `SUMMON` may consume those values to override the summoned instance's current stats, while the card definition remains ordinary serialized data.

**Why:** Effects such as destroying generated cards and summoning a token based on their live stats need sequencing and must not become card-name-specific branches or reparsed natural-language behavior.

**How to apply:** Preserve the frame-local producer/consumer ordering when adding similar value resolvers. The producer must capture values before cards leave the board, and the consumer must clear them after use so nested enter-field effects cannot accidentally reuse stale values.