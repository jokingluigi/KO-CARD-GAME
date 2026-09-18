---
name: Champion portrait uploads
description: Champion base and quest-complete portrait storage and fallback behavior
---

Champion base portraits and quest-complete portraits are separate image assets. The completed portrait is optional; when it is absent or disabled, the HUD must use the base portrait after quest completion.

**Why:** Admins need to prepare a normal Champion image without being forced to create a second asset, and gameplay must never render an empty portrait after a quest.

**How to apply:** Reuse the authenticated card-image upload flow for both asset types, validate new upload tokens server-side, keep cleanup reference-aware across cards and both Champion portrait columns, and derive the display URL from a valid asset path when normalizing saves.