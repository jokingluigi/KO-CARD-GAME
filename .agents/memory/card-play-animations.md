---
name: Card play presentation
description: Visual sequencing rules for hand-to-board and technique card play animations
---

Card play animation must remain a client-side presentation layer. Keep the game engine's successful action and ENTER_FIELD execution synchronous and exactly once; animate a snapshot from the pre-action DOM position, hide the destination card until the motion completes, and defer entrance audio to the landing callback when possible.

**Why:** Splitting the engine action to wait for CSS would risk changing rule timing, duplicating triggers, or leaving GameState partially committed if an animation fails.

**How to apply:** Use BASE COST—not current discounted cost—to choose LIGHT/NORMAL/HEAVY/VERY_HEAVY landing motion. Keep rarity effects limited to frame flash color/intensity, cap motion duration and impact, and honor prefers-reduced-motion. Technique cards use a separate center overlay rather than a board-slot landing. For hand-to-board play, commit the successful result immediately so the hand and board stay authoritative, then animate the committed card with a hidden destination card until landing completes; effect-created field cards can animate by diffing new generated ENTER_FIELD events and resolving their source/slot geometry from rendered refs. Keep the slot ref attached after a card enters the slot as well as while it is empty, or generated entrance animations will be skipped during the post-action render.

Successful card actions must update GameState immediately; animation is only a presentation layer. For hand-to-board play, hide the committed destination card while the overlay travels from the hand; for attacks, hide the committed attacker while its overlay travels to the target. Do not allow the initial async card bootstrap to overwrite an already interactive match.

**Why:** Delaying the play result leaves a duplicate card in hand during motion, while leaving the committed attacker visible makes the moving attack card look stationary; late card API responses can reset an active local match.

**How to apply:** Set the action result before starting the overlay animation, clear only the animation after its short effect gap, hide only the card represented by the moving overlay, and gate user actions until published-card bootstrap completes.