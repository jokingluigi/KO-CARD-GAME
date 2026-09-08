---
name: Effect registry source
description: Consistency rule for KO’s analyzer, Effect Library, and runtime effect types.
---

The shared Effect Registry is the authoritative source for action, trigger, target, keyword, schema, description, and resolver identifiers.

**Why:** An API-only catalog can advertise effects that the game runtime cannot execute.

**How to apply:** Add or change effect identifiers in the shared registry first, derive analyzer/library/runtime types from it, and keep runtime action handling exhaustively checked at compile time.