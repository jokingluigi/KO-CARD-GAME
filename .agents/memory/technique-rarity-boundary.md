---
name: Technique rarity boundary
description: TECHNIQUE cards use only NORMAL or TOKEN rarity, while WRESTLER rarity controls the frame.
---

TECHNIQUE rarity is restricted to NORMAL and TOKEN. Legacy LEGENDARY or CHAMPION technique records must normalize to NORMAL, or TOKEN when the card is explicitly a token; admin input, runtime normalization, and the data migration must agree.

**Why:** TECHNIQUE cards do not use the wrestler rarity progression, and allowing legacy values produces misleading pack, frame, and card presentation behavior.

**How to apply:** Enforce the rule at admin/API boundaries, normalize runtime data defensively, and include a persistent migration whenever the stored rarity contract changes.