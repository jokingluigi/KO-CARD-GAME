---
name: Online catalog validation
description: Canonical CardDefinition catalog requirements for restored online matches
---

Restored online match state must be validated against the exact serialized CardDefinition catalog before the runtime continues. Missing catalogs or unknown instance references are integrity errors, not opportunities to synthesize or substitute another card.

**Why:** A malformed or legacy reference can otherwise enter a later generation/render path and appear as an unintended entity while hiding the original data defect.

**How to apply:** Keep test-only state builders flexible, but validate canonical persisted online snapshots at restore time and fail explicitly with the missing definition ID.