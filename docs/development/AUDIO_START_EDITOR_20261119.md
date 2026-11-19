# Administrator music start positions

The administrator can set a music start position in seconds, adjust it with a slider, and preview the chosen position. Zero means the original beginning. The UI reads duration metadata and bounds edits before the track ends; manual seconds remain available when metadata cannot load.

Surfaces:

- Card entrance audio and champion completion/finisher-ready audio (`AdminAudioField`): use the existing card/champion Save action.
- Champion/skin finisher OST (`MusicTrackEditor`): use its existing enclosing Save action.
- BGM/title music and victory/defeat music in the media catalog: use “시작 지점 저장”. A dedicated preview plays the draft position before saving.

Offsets persist as standard `#t=seconds` media fragments on the existing audio URL columns/JSON fields. Asset identity and uploaded bytes do not change, and no schema migration or catalog reset is involved. URLs without a fragment continue to start at zero. Administrator parsers preserve the offset when reconstructing canonical uploaded-asset URLs; malformed, negative, nonfinite and >86400-second values are rejected. File deletion reference checks ignore fragments, so a track referenced by a finisher with a different offset remains protected.

Playback explicitly seeks after metadata (or immediately for prepared audio), and starts previews, entrances, BGM and result/reveal music consistently. Nonzero-offset BGM/legendary loops return to the configured start. Repeated same-track BGM updates retain this loop behavior. Existing mute, volume, priority, unlock handling and playback duration remain unchanged.

Validation:

- 47 focused playback/offset/upload/preload/streaming regressions passed.
- 6 real authenticated HTTP/database tests passed in isolated PGlite databases: saving/reloading BGM offsets through title/game catalogs, card entrance and champion offsets, authorization, unchanged card stats/status/asset identity, invalid offsets, zero reset, plus existing result-music selection/volume regressions.
- Real Chromium desktop (1280px) and mobile (390px) component checks: a selected 1.2-second offset played at 1.2 seconds; draft save callback received 0.8; out-of-duration entry clamped; no runtime errors or horizontal overflow.
- Workspace typecheck passed. Frontend/API production builds passed.

Production catalog data is not modified by development or tests. Current cards/champions and Claude presentation work remain in the source ancestry.
