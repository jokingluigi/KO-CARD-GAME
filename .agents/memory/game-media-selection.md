---
name: Match media selection
description: How background images and BGM remain stable for a match
---

Enabled backgrounds and BGMs are chosen independently exactly once when a match starts. The game state stores only the selected IDs; rendering and audio playback resolve those IDs against the loaded public catalog and never reroll on ordinary state updates.

**Why:** A match must keep its visual and audio identity stable even as turns, effects, and UI renders update state.

**How to apply:** Add new media at the catalog/upload boundary, not inside render effects or card/combat transitions. Empty catalogs must resolve to no selected media so the existing fallback background and silent audio behavior remain intact.