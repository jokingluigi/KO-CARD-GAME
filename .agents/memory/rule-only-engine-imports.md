---
name: Rule-only engine imports
description: Prevent initialization cycles when server code needs only shared game-rule helpers.
---

When API code needs only canonical deck rules or constants, import them from the dedicated rules subpath instead of the aggregate game-engine entrypoint. Do not copy the constants or rely on client-side duplicates.

**Why:** The aggregate entrypoint loads runtime engine modules that can re-enter client rule adapters. Importing it from AI deck validation caused a `DECK_SIZE` initialization cycle in tests; the rule-only export avoids that dependency loop.

**How to apply:** Before importing the aggregate engine package for a few rule values, check for and use its dedicated rules export.