---
name: Adjacent summon result semantics
description: Rules for deterministic adjacent random summons and their same-resolution follow-up targets.
---

Adjacent-empty-slot random SUMMONs use one deterministic RNG stream with one independent roll per available slot, so repeated CardDefinitions are valid. The follow-up target set contains only instances that actually entered the requested board slot; failed or unavailable summons must not receive later effects.

**Why:** A pool-level shuffle makes two adjacent slots dependent and prevents replacement, while recording generated IDs before board insertion can target cards that never entered play.

**How to apply:** Keep generic RANDOM generation semantics separate from ADJACENT_EMPTY_SLOTS. Clear the engine-owned last-target set at the start of each creation resolution and replace it only with successful SUMMON instance IDs before SAME_TARGET resolves.