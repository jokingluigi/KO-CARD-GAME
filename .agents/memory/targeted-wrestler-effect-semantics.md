---
name: Targeted wrestler effect semantics
description: Non-obvious zone and duration rules confirmed for the corrected Dehun and Natomato effects.
---

데헌의 first attack-increase reaction is a HAND-only effect. A board copy must not gain the reaction, and the hand instance must remain in HAND with no board placement or targeting side effect.

**Why:** The authoritative card behavior and regression requirements distinguish the hand reaction from board listeners; a BOARD target silently makes the hand trigger resolve with no valid SELF target.

나토마토's combo attack increase is a THIS_TURN temporary modifier. Do not implement turn-end cleanup by setting the card's complete attack value to zero, because that erases permanent attack changes that existed before the combo.

**Why:** Temporary modifier expiration restores the prior effective attack while preserving permanent changes; a destructive SET_STATS reset cannot distinguish the combo contribution.

**How to apply:** When editing these cards or related generic effect behavior, preserve HAND-only targeting for 데헌 and use the temporary stat layer for 나토마토's combo contribution.