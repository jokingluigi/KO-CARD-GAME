---
name: Shared card event listeners
description: Attack-stat and attack-survival card mechanics are implemented as registry-backed triggers rather than card-name branches.
---

Attack-stat growth and attack-survival rewards must flow through shared structured triggers. Stat-listener effects carry an internal attribution marker so a listener's own attack bonus cannot recursively retrigger itself.

**Why:** The card specification requires cross-zone listeners, repeated Mandrill-style bonuses, and recursion safety without hardcoded card names.

**How to apply:** When adding a card that reacts to an attack stat change or a survived wrestler attack, add registry-backed structured data and tests at the event boundary instead of branching on its definition name.