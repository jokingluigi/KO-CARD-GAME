---
name: Active Champion Token boundary
description: Distinguishes the linked special Champion Token deployment from ordinary generated Champion Token cards.
---

Only the linked Champion Token created by `DEPLOY_CHAMPION_TOKEN` is the active protection state for a Champion. Ordinary `SUMMON` and `GENERATE` Champion Tokens must remain ordinary cards: they can be targeted, damaged, and retired without immediately defeating their owner.

**Why:** Champion protection and defeat coupling are gameplay rules of the attached Champion deployment, not properties of the Champion Token card definition or rarity.

**How to apply:** Resolve the current Champion's linked definition at match runtime, mark only that instance with the existing direct-deployment flag, exclude the protected Champion from player targeting, and keep generic token creation on the regular generation path.