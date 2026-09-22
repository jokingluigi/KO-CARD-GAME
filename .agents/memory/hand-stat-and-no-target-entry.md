---
name: HAND stat and no-target entry
description: Generic engine boundaries for hidden-zone stat triggers and WRESTLER entrance choices with no candidates.
---

Stat-change listeners subscribe only to the changed CardInstance in HAND or BOARD. A positive attack or health/max-health change dispatches one listener resolution; decreases and unchanged values do not. DECK and GRAVEYARD are not listener zones.

**Why:** HAND stat effects must be authoritative without expanding hidden-zone semantics to unrelated zones, and a single health buff can change both current and max health without double-triggering.

For WRESTLER PLAY_FROM_HAND, an ENTER_FIELD PLAYER_CHOICE effect with zero valid targets is skipped after the card is paid and placed on BOARD. It must not fail the play or leave targeting/pending state. Valid targets still use the existing PLAYER_CHOICE continuation.

**Why:** Entrance effects resolve after field entry; no candidates make only that effect a no-op, not an invalid card play.

**How to apply:** Keep the no-target exception scoped to WRESTLER ENTER_FIELD resolution. Other mandatory choices, such as technique or active effects, retain their existing preflight behavior.