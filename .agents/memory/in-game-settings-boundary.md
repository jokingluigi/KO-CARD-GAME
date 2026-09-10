---
name: In-game settings boundary
description: Scope rules for local KO settings and surrender state transitions
---

The in-game settings surface is intentionally small: BGM mute is a presentation preference, while surrender is a real terminal GameState action. BGM mute must change only the currently tracked BGM element's effective volume, preserving its URL and playback state; card and quest audio use the separate stinger channel.

**Why:** Stopping or replacing the BGM on mute would make unmuting restart the track, and a UI-only surrender result would leave the match state inconsistent for synchronization or persistence.

**How to apply:** Route the settings popup through the existing AudioManager and persist only the mute preference locally. Route surrender through the engine action that validates an in-progress state and a known player, then sets `status`, `winnerId`, `loserId`, `activePlayerId`, and a `SURRENDER` event without touching combat, effects, cards, or champion rules.