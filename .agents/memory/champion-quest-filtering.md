---
name: Champion quest event filtering
description: Rules for evaluating structured Champion quest conditions against game events.
---

Quest progress must match the full structured condition, not only the event name. Conditions such as card type and per-event progress are evaluated from event metadata before incrementing progress.

**Why:** Counting every CARD_GENERATED event would make a quest for generated wrestler cards progress from generated technique cards as well.

**How to apply:** Put filter metadata on every generated-card event, keep the condition in the match snapshot, increment by its progress value, and clamp at the required total.