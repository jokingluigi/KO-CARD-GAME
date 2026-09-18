---
name: Production publish data boundary
description: Rules for initializing KO's first Replit Production database without carrying over development test state.
---

Production database initialization must remain separate from development data. If Replit offers to copy development data during the first Publish, exclude TEST USER, TEST ADMIN, test sessions, test purchases, and debug-only records; supply only the canonical game content required by the live game.

**Why:** Replit creates a separate Production database but may offer a development-data copy during initial Publish. The repository has no safe reason to delete or sanitize copied data at server startup, and test admin credentials are present in development-only tooling.

**How to apply:** Keep Production startup limited to idempotent configuration bootstrap such as the configured ADMIN account. Make the first-Publish data-copy choice explicitly, then verify Production user/session/economy isolation after deployment.