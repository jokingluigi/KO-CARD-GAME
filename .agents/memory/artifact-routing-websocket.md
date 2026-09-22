---
name: Artifact WebSocket routing
description: Web and API artifact path ownership for same-origin REST and WebSocket traffic.
---

The static KO web artifact must own only its frontend route prefix. Authenticated HTTP requests, including the WebSocket ticket request, should use the frontend-relative `/api` rewrite so the browser sends its frontend-host session cookie. The WebSocket upgrade itself must use the API host directly with `wss://`; `/api/online-matches/ws` belongs to the API artifact.

**Why:** Cross-origin ticket requests do not include a session cookie set on the static frontend host, while the static rewrite cannot proxy a WebSocket upgrade reliably. Either mismatch appears to the player as a generic connection failure.

**How to apply:** Keep HTTP API/ticket URLs relative to `BASE_URL`, and keep only the production WebSocket origin absolute. Test both the frontend-host ticket endpoint and the direct API-host upgrade path; an unauthenticated request should return the API's auth rejection, not HTML.