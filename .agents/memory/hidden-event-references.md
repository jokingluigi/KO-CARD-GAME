---
name: Hidden event references
description: Viewer projection rules for events that mention cards in hidden zones
---

Online event sanitization must redact card instance IDs and nested references when they point to an opponent's current hand or deck, not only for draw/generate event types. Public references in the same event, such as a visible source card, may remain. Historical draw/generate events retain their broader redaction behavior.

**Why:** Generic stat/effect events can otherwise expose the identity of a card that remains hidden even though the current player zone projection is redacted.

**How to apply:** Build hidden IDs from the viewer-relative state projection and sanitize both snapshot and incremental event paths with the same rule.