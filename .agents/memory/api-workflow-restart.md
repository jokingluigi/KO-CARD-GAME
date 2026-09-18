---
name: API workflow restart after route changes
description: Black-box validation behavior for the bundled API server during development.
---

After changing API route or WebSocket logic, restart the managed API workflow before validating behavior through HTTP or WebSocket requests; the running bundled process may continue serving the previous implementation.

**Why:** A live request can otherwise report stale normalization behavior, or an old WebSocket handler can reject a newly added message, even though the source and type checks are correct.

**How to apply:** Run source-level tests first, restart `artifacts/api-server: API Server` once after the code batch, then run authenticated HTTP/WebSocket smoke checks against the API.