---
name: Online PvP foundation
description: Server-authoritative KO match runtime, persistence, and viewer sanitization constraints.
---

The online match layer must reuse the DOM-free KO engine through a shared workspace package. The API owns the authoritative GameState, serializes actions per match, persists only accepted state changes, and authenticates WebSocket users from the existing session cookie.

**Why:** Low-cost beta operation requires one API process with in-memory active runtimes while still surviving restarts from the latest serialized state; hidden information must never be reconstructed on the client.

**How to apply:** Snapshot definitions and validated owned decks at match start, derive the seat from the authenticated user rather than payload fields, keep request-id idempotency scoped to the match and replay duplicates only to the requester, preserve the published `cardPool` catalog for client-side `definitionRef` resolution, and remove `randomSeed` plus opponent hand/deck identity from viewer messages. Redact opponent draw/generation events by event type rather than current-zone inspection, because later snapshots may occur after the card leaves hand.

The viewer projection may include `cardPool` because it is the public catalog of published CardDefinitions, not either player's owned deck. It must never include the random seed or private card identities.

**Why:** Removing the public catalog made sanitized online snapshots unable to resolve definitionRef-based SUMMON effects in the shared client engine, while retaining it does not disclose ownership or hidden-zone identity.

**How to apply:** Keep opponent hand/deck as count-only objects and retain historical hidden-event redaction; only expose definitions that were already included in the server's published match snapshot.

An online ability requiring a player-selected target must open a server-owned pre-commit choice. Validate its underlying ability for legality, but execute the pre-commit intent and charge or mark usage only when the server confirms a valid target. A targetless ability executes directly. The client must not decide legality from its sanitized viewer projection.

**Why:** A duplicated client/server action contract once rejected the pre-commit intent as an unknown message before the engine ran. Simply sending the direct ability instead would commit cost before cancellation, while a sanitized client state can misjudge whether an ability is legal.

**How to apply:** Keep one lightweight shared wire contract separate from runtime-heavy engine imports; derive the acting player and current ability from authoritative match state, preserve the pending choice across reconnect snapshots, and reject direct actions that would begin interactive targeting.