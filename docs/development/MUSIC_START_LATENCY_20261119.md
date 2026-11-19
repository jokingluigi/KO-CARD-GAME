# Music start latency

Before this change, uploaded Supabase audio was downloaded in full into an API buffer before any bytes reached the browser. A production BGM range probe returned HTTP 200 with the entire 2,789,141-byte file and no Content-Range/Accept-Ranges (first bytes at 692 ms in one request; not a benchmark).

Additional client delay: hand-played entrances waited for the animation-complete callback before requesting audio. Ordinary entrance music also accumulated in a ten-second FIFO, so a later card could play its music after its visual moment had passed.

Changes:

- Supabase audio/game-bgm/game-attack files stream through the existing public API path without full-file buffering. Signed upstream URLs remain server-side. Browser Range and upstream 206/416 headers are forwarded; disconnect cancels upstream work. Image/upload verification paths and the Replit provider are unchanged.
- A bounded preparation cache (16 elements) warms the selected match BGM, champion/finisher music, visible hand/board entrances and result music. Hidden decks/opponent hands and unrelated BGM catalog entries are excluded. No playback/autoplay bypass occurs during preparation. Obsolete prepared tracks are released when match candidates change.
- Actual playback consumes the prepared HTMLAudioElement. Replacement BGM begins loading during the outgoing fade instead of afterwards.
- Local and online entrances request music with the ENTER_FIELD event instead of after animation completion. A new ordinary entrance replaces the previous ordinary entrance; ordinary entrances do not interrupt or queue behind legendary music. Legendary priority and volumes remain unchanged.

Validation: 45 focused tests passed, covering progressive first-byte delivery before upstream completion, byte ranges, 416/404 handling, disconnect cancellation, bounded/reused/retryable preparations, private-zone exclusion, latest-entrance behavior and existing autoplay/mute/music-priority/result/quest regressions. Workspace typecheck and frontend/API production builds passed. This change does not alter card rules, card/champion administrator data, or battle animation geometry/timing.
