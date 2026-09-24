---
name: Hidden event references
description: Viewer projection rules for events that mention cards in hidden zones
---

Online projection must redact card instance IDs and nested references when they point to an opponent's current hand or deck, not only for draw/generate event types. Public references in the same event, such as a visible source card, may remain. Historical draw/generate events retain their broader redaction behavior.

The viewer sanitizer must also filter pending card effects, delayed effects, and rule listeners whose source ID refers to a hidden instance. Delayed effects may retain a complete source-card snapshot even after their source moves, so check both `sourceInstanceId` and nested `sourceCard.instanceId`.

**Why:** Generic stat/effect events and persisted queues can otherwise expose the identity, definition, or tags of a card that remains hidden even though the current player zone projection is redacted.

**How to apply:** Build hidden IDs from the viewer-relative state projection and sanitize snapshot, incremental event, and pending-state paths with the same rule. Preserve public card definitions in `cardPool`; catalog metadata is not a hidden instance reference.