---
name: Main content boundary
description: Main notices are plain text, while the existing game_media catalog serves both matches and the main menu through a separate main selection flag.
---

Keep main-menu content separate from gameplay state: public main content filters enabled notices and enabled media with the main selection flag, while match media continues using its existing enabled catalog. Notices render as escaped plain text, not dangerous HTML.

**Why:** The product needs admin-managed content without changing Online media selection or introducing a second storage system.

**How to apply:** Use the existing game-media upload/storage path for background and BGM assets, make one main item selectable per media type, and keep public responses limited to active content.