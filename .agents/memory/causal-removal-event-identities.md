---
name: Causal removal event identities
description: Keep distinct removals within one action separate while deduplicating exact event replays.
---

A causal removal event should retain its root action identity and receive its own stable causation identity. Do not identify every removal from one action using only the root ID: one action can remove several distinct targets, and a target can be removed again after revival.

**Why:** Champion quests and source-caused listeners need exactly one application per unique removal. Root-only identity conflates separate removals; a per-event identity lets consumers distinguish valid separate events while recognizing replay of the same serialized event.

**How to apply:** Derive the causation ID from a stable append-order event identity when the removal event is created. Preserve it through event serialization and replay, then deduplicate using the root, causation ID, event type, source, and target.