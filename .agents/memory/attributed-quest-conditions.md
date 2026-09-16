---
name: Attributed quest conditions
description: How quests that require a particular source action avoid counting unrelated events.
---

Quest conditions that describe a specific ability or action must carry a sourceActionType and be matched against the event's serialized sourceContext, including the owning player and Champion definition when applicable.

**Why:** A generic CARD_RETIRED event can be produced by combat, ordinary card effects, or a Champion ability. Counting all of them for a source-specific quest gives players progress for the wrong action and breaks event replay semantics.

**How to apply:** Add the source constraint to published quest data, preserve it through the record-to-definition conversion, and propagate sourceContext through nested effect, leave-field, and retirement-listener continuations.