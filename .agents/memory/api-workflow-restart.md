---
name: API workflow restart after route changes
description: Black-box validation behavior for the bundled API server during development.
---

After changing API route logic, restart the managed API workflow before validating behavior through proxied HTTP requests; the running bundled process may continue serving the previous route implementation.

**Why:** A live request can otherwise report stale normalization behavior even though the source and type checks are correct, leading to false debugging signals.

**How to apply:** Run source-level tests first, restart `artifacts/api-server: API Server` once after the code batch, then run authenticated POST/PATCH smoke checks against the proxied API.