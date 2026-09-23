---
name: Main content boundary
description: Main notices are plain text, while shared game media uses independent title and in-game selection scopes.
---

Keep main-menu content separate from gameplay state: public main content filters enabled notices and title-selected media, while match media uses the independent in-game catalog flag. Notices render as escaped plain text, not dangerous HTML. Legacy rows may temporarily fall back from mainEnabled to titleEnabled until the schema backfill runs.

**Why:** Title Background/Music and In-Game Background/Music must not overwrite or leak into one another, while existing uploaded assets and match priority behavior remain unchanged.

**How to apply:** Use the existing game-media upload/storage path, persist gameEnabled and titleEnabled independently, make one title item selectable per visual/audio media type, and keep public responses limited to active content.