---
name: Online presentation projection
description: The boundary between server-sanitized online state and the shared KO match presentation.
---

Online Match must render the shared GameStatePreview rather than maintain a second board implementation. The server keeps canonical player order and replaces the opponent hand/deck with count-only objects; the client projection reorders players so the viewer is always players[0] and turns hidden counts into stable card-back placeholders. The projection must never reconstruct private card definitions.

**Why:** Shared presentation logic depends on viewer-first player geometry and array-shaped zones, while hidden-zone objects are required to prevent private card data from reaching the browser UI.

**How to apply:** Keep engine transitions server-authoritative. Fetch the public card/media catalog separately, send only OnlineActionPayload messages, and use state/event sequence resets to discard stale animation state after snapshot or resync.