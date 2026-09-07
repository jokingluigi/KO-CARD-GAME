---
name: Structured card effects
description: Durable safety and compatibility rules for administrator-authored KO card effects.
---

New administrator-authored card effects use a versioned, validated structured-data format. Display text is never interpreted during a match, and unsupported or partially understood text cannot be applied.

**Why:** Silently inferring a partial effect from natural-language text creates cards whose displayed behavior differs from gameplay. Executable code generation would also create an unacceptable security boundary.

**How to apply:** Preserve legacy effect IDs for existing cards. For new mechanics, extend the parser allowlist, server validator, typed runtime registry, human-readable preview, and regression tests together. Never use dynamic JavaScript execution or card-name checks.