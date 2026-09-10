---
name: Admin preview route
description: Browser verification of the KO administrator page through the Replit preview proxy.
---

For the current KO artifact, use the preview origin’s `/admin` route when verifying the administrator UI. Do not assume the registered artifact directory name is also a URL prefix.

**Why:** The nested prefix can return the app shell while Wouter still resolves it as the not-found route, which hides the actual admin controls and produces misleading interaction results.

**How to apply:** Confirm the live route from the preview response before automating login or field interactions; keep API calls relative to the artifact’s runtime base rather than hardcoding a directory name.