---
name: Generated damage modifiers
description: Field-based structured damage auras apply to both card effects and combat, with source eligibility encoded in the effect.
---

Damage modifiers should be represented as structured field effects with an explicit damage source scope, not as card-specific flags or text reparsing. The active board determines the bonus, so removing the aura card naturally removes the modifier.

**Why:** The same modifier must cover generated cards' card-effect damage and ordinary attack damage while expiring automatically when the source leaves the field.

**How to apply:** Resolve the current controller's board auras at damage time, require the source card to match the declared scope, and keep the modifier action declarative in the shared registry.