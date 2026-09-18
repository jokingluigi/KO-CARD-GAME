---
name: BGM preference scaling
description: How the match BGM volume preference interacts with media-defined volumes and independent effects
---

The user's BGM slider is a persisted 0–100 multiplier applied to the media catalog's configured BGM volume. It must remain effective when no track is playing and after base-track replacement or fade transitions; attack, entrance, and pack-reveal effects do not use this preference.

**Why:** Media entries already carry author-controlled loudness, so treating the slider as a replacement value changes the intended mix and can make tracks unexpectedly louder or quieter. BGM mute/volume must not suppress gameplay SFX.

**How to apply:** Keep the preference in the shared AudioManager, apply it at every BGM volume write, and persist only the preference value in browser storage.