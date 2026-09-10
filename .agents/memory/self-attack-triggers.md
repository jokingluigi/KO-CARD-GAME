---
name: Self-attack triggers
description: The reusable trigger boundary for effects that fire when the source card itself attacks.
---

`SELF_ATTACK` is distinct from `OTHER_ALLY_ATTACK`: combat dispatches the source card's own trigger once per successful attack, then dispatches the other-ally board listeners. This preserves the meaning of “this card attacks” without card-specific branches.

**Why:** Reusing the other-ally listener for self-attacks either misses the source card or creates duplicate/incorrect reactions for cards that listen to allied attacks.

**How to apply:** Add self-attack behavior through the shared trigger registry and structured analyzer. Dispatch it from every successful basic-attack path before normal other-ally listeners, with the post-attack source card context.