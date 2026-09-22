---
name: Presentation event keys
description: Performance and identity rule for match presentation event deduplication
---

Presentation event identity should use the event's append-order index plus a compact identity fingerprint. Do not scan and deep-serialize the entire prefix of the event log for every event.

**Why:** Prefix occurrence counting turns a long event log into quadratic work during each presentation update and can contribute to general match lag.

**How to apply:** Preserve distinct keys for duplicate payloads and stable keys across identical resyncs while keeping key construction O(1) per event.