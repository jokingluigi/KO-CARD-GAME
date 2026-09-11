---
name: Audio transition policy
description: KO music layering rules for persistent quest bases and temporary entrance tracks
---

The newest valid completed-Champion music is the persistent match base. Card or wrestler entrance music is temporary: it fades the base down, plays independently, and resumes the newest base when it ends. Replacing a base fades the old track out before installing the new one; SFX stay immediate and independent from music mute/fades.

**Why:** Quest completion music must remain audible after its completion event, while temporary presentation audio must not lose a later quest update.

**How to apply:** Keep these layers separate in AudioManager and make base replacement safe when an entrance track is already active.