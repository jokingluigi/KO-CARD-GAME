---
name: Structured card effects
description: Durable safety and compatibility rules for administrator-authored KO card effects.
---

New administrator-authored card effects use a versioned, validated structured-data format. Display text is never interpreted during a match, and unsupported or partially understood text cannot be applied.

**Why:** Silently inferring a partial effect from natural-language text creates cards whose displayed behavior differs from gameplay. Executable code generation would also create an unacceptable security boundary.

**How to apply:** Preserve legacy effect IDs for existing cards. For new mechanics, extend the parser allowlist, server validator, typed runtime registry, human-readable preview, and regression tests together. Never use dynamic JavaScript execution or card-name checks.

Numeric values must be resolved from the matched action clause, never from the full multi-effect sentence.

**Why:** Target counts and earlier effects can otherwise be silently reused as the amount of a later damage, draw, gold, or cost action.

**How to apply:** Keep target-count parsing separate from action-value parsing and add a multi-clause regression case whenever a new numeric action is registered.