---
name: Unified effect implementation prompt
description: The admin-wide implementation prompt must analyze live card and Champion data against the current registry and treat Champion Tokens as references.
---

The combined implementation prompt is a live analysis report, not a cached status snapshot: every run rereads all WRESTLER CardDefinitions, applicable Champion slots, and the current Effect Library. It collects only unsupported analysis details and merges equivalent mechanic descriptions before generating one prompt. Champion Token effects remain owned by CardDefinition/Card Admin and are included only as references.

**Why:** Stale analyzer output or duplicating Token effects in Champion data can produce prompts that implement already-supported mechanics or diverge from runtime ownership.

**How to apply:** Preserve this boundary whenever adding new analyzer contexts, Champion slots, or admin implementation actions; add a focused regression test when the response shape or deduplication rules change.