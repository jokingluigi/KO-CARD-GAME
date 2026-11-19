# Music start latency

Before this change, uploaded Supabase audio was downloaded in full into an API buffer before any bytes reached the browser. A production BGM range probe returned HTTP 200 with the entire 2,789,141-byte file and no Content-Range/Accept-Ranges (first bytes at 692 ms in one request; not a benchmark).

Additional client delay: hand-played entrances waited for the animation-complete callback before requesting audio. Ordinary entrance music also accumulated in a ten-second FIFO, so a later card could play its music after its visual moment had passed.

Changes:

- Supabase audio/game-bgm/game-attack files stream through the existing public API path without full-file buffering. Signed upstream URLs remain server-side. Browser Range and upstream 206/416 headers are forwarded; disconnect cancels upstream work. Image/upload verification paths and the Replit provider are unchanged.
- A bounded preparation cache (16 elements) warms the selected match BGM, champion/finisher music, visible hand/board entrances and result music. Hidden decks/opponent hands and unrelated BGM catalog entries are excluded. No playback/autoplay bypass occurs during preparation. Obsolete prepared tracks are released when match candidates change.
- Actual playback consumes the prepared HTMLAudioElement. Replacement BGM begins loading during the outgoing fade instead of afterwards.
- Local and online entrances request music with the ENTER_FIELD event instead of after animation completion. A new ordinary entrance replaces the previous ordinary entrance; ordinary entrances do not interrupt or queue behind legendary music. Legendary priority and volumes remain unchanged.

Validation: 45 focused tests passed, covering progressive first-byte delivery before upstream completion, byte ranges, 416/404 handling, disconnect cancellation, bounded/reused/retryable preparations, private-zone exclusion, latest-entrance behavior and existing autoplay/mute/music-priority/result/quest regressions. Workspace typecheck and frontend/API production builds passed. This change does not alter card rules, card/champion administrator data, or battle animation geometry/timing.

## Verified production release

Source revision: `c45199a8edb42f16284709f52af74d437991fff5`. API `dep-dbv4g249v7es738lbnh0` and frontend `dep-dbv4ga3l550s738mgoog` are live at this revision. Public API health, actual frontend entry JavaScript and version.json all match. The frontend environment approval guard is preserved.

The same 2,789,141-byte production BGM now returns HTTP 206 with exactly 65,536 bytes and `Content-Range: bytes 0-65535/2789141` through both the API origin and the public game origin. Single-request header times were 824 ms / 330 ms respectively; these are verification observations, not a controlled latency benchmark. The previous endpoint returned all 2,789,141 bytes with HTTP 200 despite the range request.
