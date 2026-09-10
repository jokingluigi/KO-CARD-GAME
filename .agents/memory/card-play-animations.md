---
name: Card play presentation
description: Visual sequencing rules for hand-to-board and technique card play animations
---

Card play animation must remain a client-side presentation layer. Keep the game engine's successful action and ENTER_FIELD execution synchronous and exactly once; animate a snapshot from the pre-action DOM position, hide the destination card until the motion completes, and defer entrance audio to the landing callback when possible.

**Why:** Splitting the engine action to wait for CSS would risk changing rule timing, duplicating triggers, or leaving GameState partially committed if an animation fails.

**How to apply:** Use BASE COST—not current discounted cost—to choose LIGHT/NORMAL/HEAVY/VERY_HEAVY landing motion. Keep rarity effects limited to frame flash color/intensity, cap motion duration and impact, and honor prefers-reduced-motion. Technique cards use a separate center overlay rather than a board-slot landing.