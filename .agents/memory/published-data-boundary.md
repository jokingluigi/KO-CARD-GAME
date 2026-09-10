---
name: Published data boundary
description: The runtime boundary between published API data and development-only test fixtures.
---

The playable KO screen must only render after published cards, champions, and media have loaded successfully. Missing or failed public data should show a retryable setup error, never a test deck or test champion.

**Why:** A silent fallback made intermittent API failures look like the app had reverted to an old version, and it could expose development fixtures in the player-facing game.

**How to apply:** Keep test definitions available for engine tests and explicit admin test routes, but gate the normal home route on usable published data and make failures visible.