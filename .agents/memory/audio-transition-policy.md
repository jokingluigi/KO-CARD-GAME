---
name: Audio transition policy
description: KO music layering rules for persistent quest bases and temporary entrance tracks
---

The newest valid completed-Champion music is the persistent match base. Title and admin-preview BGM belong to the non-battle scope; match-selected and quest-completion tracks belong to the battle scope, and a base plays only when the active route context matches its scope. Card or wrestler entrance music is temporary: ordinary entrance audio fades the base down, while a Legendary entrance pauses the exact base instance and playback position, plays for about seven seconds with a fade-out, and resumes the newest base when it ends. Replacing a base fades the old track out before installing the new one; SFX stay immediate and independent from music mute/fades. Only browser autoplay denial should set the unlock-pending state; media load errors are reported as asset failures and are not retried as gesture locks.

**Why:** Quest completion music must remain audible after its completion event, while temporary presentation audio must not lose a later quest update. Admin preview can mask a battle-scope mismatch, and a missing file must not trigger repeated autoplay retries.

**How to apply:** Keep these layers separate in AudioManager. Assign every persistent BGM caller to its route scope, distinguish media errors from `NotAllowedError`, route Legendary behavior from generic card rarity metadata, guard delayed callbacks by their audio instance, and let a newer Quest base replace the paused track before the override resumes.