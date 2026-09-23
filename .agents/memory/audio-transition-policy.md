---
name: Audio transition policy
description: KO music layering rules for persistent quest bases and temporary entrance tracks
---

The newest valid completed-Champion music is the persistent match base. Card or wrestler entrance music is temporary: ordinary entrance audio fades the base down, while a Legendary entrance pauses the exact base instance and playback position, plays for about seven seconds with a fade-out, and resumes the newest base when it ends. Replacing a base fades the old track out before installing the new one; SFX stay immediate and independent from music mute/fades.

**Why:** Quest completion music must remain audible after its completion event, while temporary presentation audio must not lose a later quest update.

**How to apply:** Keep these layers separate in AudioManager. Route Legendary behavior from generic card rarity metadata, guard delayed callbacks by their audio instance, and let a newer Quest base replace the paused track before the override resumes.