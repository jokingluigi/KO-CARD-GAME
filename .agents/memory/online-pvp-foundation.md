---
name: Online PvP foundation
description: Server-authoritative KO match runtime, persistence, and viewer sanitization constraints.
---

The online match layer must reuse the DOM-free KO engine through a shared workspace package. The API owns the authoritative GameState, serializes actions per match, persists only accepted state changes, and authenticates WebSocket users from the existing session cookie.

**Why:** Low-cost beta operation requires one API process with in-memory active runtimes while still surviving restarts from the latest serialized state; hidden information must never be reconstructed on the client.

**How to apply:** Snapshot definitions and validated owned decks at match start, derive the seat from the authenticated user rather than payload fields, keep request-id idempotency scoped to the match and replay duplicates only to the requester, and remove randomSeed/cardPool/opponent hand/deck details from viewer messages. Redact opponent draw/generation events by event type rather than current-zone inspection, because later snapshots may occur after the card leaves hand.