---
name: Granted card text layer
description: Durable rules for runtime text copied from a published card definition onto a card instance.
---

Executable text copied between cards must live in a separate serializable CardInstance layer. The printed abilities and keywords remain unchanged; active runtime helpers decide whether printed text, granted text, or both are currently effective.

**Why:** Silence must suppress printed text, newly granted text must be able to run while the card remains silenced, and a later silence must remove the granted layer without restoring or rewriting printed content.

**How to apply:** Select donors only from the authoritative match cardPool, copy only rules text/keywords/abilities, resolve copied effects through the existing continuation and target-validation paths, and render the active layer rather than reading raw printed fields.