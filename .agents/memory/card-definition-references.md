---
name: CardDefinition references
description: Durable rules for natural-language card creation references and published match snapshots.
---

Natural-language card names are resolved only during admin analysis against the live CardDefinition catalog. Saved structured effects carry the stable CardDefinition ID; runtime never falls back to a display name.

**Why:** Card names can be renamed or duplicated, while runtime name matching would silently choose the wrong card or make published behavior depend on mutable text.

**How to apply:** Treat missing and duplicate names as explicit analyzer errors, include referenced-card metadata in admin previews and implementation prompts, and ensure published match snapshots contain referenced definitions before effects execute.