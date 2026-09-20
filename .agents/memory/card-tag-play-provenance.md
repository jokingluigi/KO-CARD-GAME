---
name: Card tag play provenance
description: The event provenance boundary used by same-tag card mechanics
---

Same-tag effects recognize only an allied WRESTLER whose CARD_PLAYED event has reason `PLAY_FROM_HAND` during the current player turn. Summon, revive, Champion Token deployment, and other generated entry paths do not qualify.

**Why:** Card instances can be generated, revived, or deployed without representing a normal hand play. Using board presence or a generic CARD_PLAYED event would make those paths incorrectly activate tag synergies.

**How to apply:** Preserve the play reason and card type on the event, filter the current-turn history by player/card identity/type/reason, and compare canonical tag arrays through the shared helper.