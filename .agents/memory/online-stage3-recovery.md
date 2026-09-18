---
name: Online Stage 3 recovery
description: Durable online-match recovery decisions for timestamp timers, reconnect grace, lazy restore, and connection ownership.
---

Online Match recovery metadata belongs with the persisted match record and is restored lazily into one per-match runtime; it must not be represented as per-second state updates or a second game engine.

**Why:** reconnect, process restart, timeout, and duplicate-tab races all need server-owned deadlines and serialized state transitions, while the game engine remains the shared authority for normal actions.

**How to apply:** persist turn and reconnect deadlines only at turn transitions, disconnect/reconnect transitions, and accepted actions; schedule one deadline timeout per concern; sanitize every resume snapshot; gate WebSocket actions through the latest primary connection; use snapshot resync instead of replaying missed presentation events.