---
name: Artifact WebSocket routing
description: Web and API artifact path ownership for same-origin REST and WebSocket traffic.
---

The static KO web artifact must own only its frontend route prefix. `/api` and `/api/online-matches/ws` belong to the API artifact; listing them on the web service can make the preview/deployment router return Vite or static HTML instead of forwarding the WebSocket upgrade.

**Why:** A normal API health request can still reach the API while the more-specific WebSocket path is intercepted by the web service, leaving the browser at `연결 종료` even though the client computes the correct `wss` URL.

**How to apply:** When diagnosing same-origin online connection failures, test the exact WS path through the artifact router and keep API/WS paths exclusive to the API service. An unauthenticated upgrade should reach the API handler and return its auth rejection, not HTML.