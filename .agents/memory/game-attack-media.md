---
name: Game attack media
description: Durable constraints for configurable attack sound effects in KO.
---

Attack sound effects are game media records, but they must stay separate from BGM in both storage and playback. Use the shared admin upload/CRUD flow with distinct attack media types, a dedicated object-storage folder, and an independent AudioManager channel.

**Why:** BGM muting, card/quest stingers, and attack impacts have different lifecycle and volume requirements. Reusing the BGM object or stinger queue makes one category unexpectedly stop or mute another.

**How to apply:** When adding another attack sound tier or changing media delivery, update the media type registry, admin validation/configuration, public object route, frontend catalog mapping, and the dedicated attack preview/playback methods together.