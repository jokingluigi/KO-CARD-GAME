---
name: Published effect data integrity
description: Guard against published card records whose text is present but runtime effect data is missing.
---

Published card text and stats are not enough to make a card playable. A record with a valid description but null `effectId` or an empty `effectConfig` produces no runtime abilities and can fail silently.

**Why:** A card can look complete in the catalog and still do nothing in a match when its executable effect fields were omitted from the saved record.

**How to apply:** When investigating a card effect bug, compare the published record's text with `effectId` and `effectConfig`, then test the exact record-to-definition mapping and a real play path. Restore development data only from the authoritative rule text/config; never write Production directly.