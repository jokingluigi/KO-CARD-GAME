---
name: SCRIPT_V1 event history
description: Bounded event-history queries are first-class declarative script steps.
---

Event-history rules must remain bounded, serializable, and separate from card-zone selection. A history query declares scope, event type, ownership/card/tag filters, and a COUNT/SUM/MIN/MAX aggregation; its numeric result can feed a later effect.

**Why:** Natural-language effects such as “this turn’s retired wrestlers” cannot be represented safely by reparsing display text or scanning unbounded history at runtime.

**How to apply:** Extend the shared registry validator and the engine’s script executor together. Keep query results numeric, cap scanned/results data, and preserve the existing no-provider runtime boundary.