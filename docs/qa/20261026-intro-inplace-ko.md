# Champion intro loading and in-place KO — 2026-10-26

## Confirmed failure paths and changes

The intro previously permanently excluded a URL after its first image error until its props changed. It also waited for a failed/pending selected skin before attempting the original. A transient 503 was reproduced in the browser. The shared portrait loader now deduplicates requests, retries up to three attempts with an eight-second bound, caches successful URLs, and allows a timed-out URL to be requested again. Intro and preparation share that loader. Original and skin load independently; the original can display while the selected skin is pending, and a late skin can replace it. A pending download is labeled as loading rather than displayed as a champion card back. Original images use contain.

Online resource startup also warmed every full-size champion image even though only two participate. That competes with the short intro's required portraits. Online snapshots now warm only the two public participants. Sandbox/local startup likewise warms its selected pair. This removes a confirmed source of needless image traffic; the precise network failure on the user's physical device was not captured.

The previous portrait fracture belonged to MatchResultOverlay: it covered the board and rendered a separate enlarged portrait. That scene was removed. GameStatePreview now owns the defeat presentation and waits for the lethal attack/effect presentation to finish before fracturing the actual defeated HUD portrait. The portal starts at that element's measured screen rectangle. Forty triangular fragments use the currently rendered equipped/awakened image, with no enlarged duplicate, backdrop or changed board layout. The original HUD element remains in layout and becomes invisible at the burst. The original style is restored on cleanup/new battle.

A 180ms crack lead-in precedes outward shards and the existing external Kenney glass recording. The normal sequence finishes at 1580ms; reduced motion uses a 350ms local fade without outward travel. The shared presentation-busy callback delays the existing result panel until completion. No server clock, game verdict, card effect, reward or persistent record changed. The glass sound is prewarmed and is not started in a hidden document.

## Files

- game/portrait-loading.ts and its test: shared retry/cache/deadline behavior.
- game/match-assets.ts: share successful-load state and bounded retries with the intro.
- components/online-match-intro.tsx and module CSS: independent original/skin availability and contain rendering.
- pages/home.tsx and pages/online-match.tsx: warm the actual selected participants.
- components/champion-defeat-burst.tsx and CSS: HUD-bound fracture, fragments, timing, cleanup and accessibility.
- components/game-state-preview.tsx: terminal presentation lifecycle and result gating.
- components/match-result-overlay.tsx: result panel only; remove detached portrait cinematic.
- docs/qa/intro-hud-ko-browser.mjs and ai-intro-portrait-browser.mjs: browser regressions.
- docs/qa/cinematic-browser.mjs and tower-v2-browser-battle.mjs: validate the new result boundary instead of the removed separate scene.

## Executed checks

- Production typecheck/build passed.
- 66 targeted tests passed, including transient failure recovery/deduplication, timeout recovery, selected pair preparation, AI dialogue mapping, quest policy/media, audio lifecycle, external assets and camera policies.
- Original intro regression passed at 390x844, 360x740 and 1440x900: late URL, failed skin/original, changed source, dialogue and skip.
- New browser checks passed at 360x740, 375x812, 390x844, 412x915 and 1440x900: first response 503 followed by successful retry; original visible before a slow skin; late skin replacement; skip; actual engine lethal attack; HUD rectangle alignment within 2px; 40 actual-image fragments moving left/right/up/down; no detached portrait scene; original stays hidden after fracture; busy state releases. Own defeat was also checked at 390x844.
- Reduced motion at 390x844 passed for both defeat sides: no fragment travel and the completion lock releases. Its initial test waited for a very short visible phase and missed it; the corrected test synchronizes on attached/phase state and inspects the retained rectangle instead of treating a missed 350ms window as a production failure.
- Actual Home AI route with isolated API fixtures and original cached artwork passed at 390x844 and 1440x900: setup → start → both champion images decoded → skip → mulligan. Specific dialogue is forwarded unchanged; fixture dialogue is test-only and is not shipped as game content.
- Shared cinematic regression passed at desktop/mobile/small/landscape/reduced sizes with no callback, overflow or stale-overlay failures.
- Isolated real HTTP/WebSocket PvP regression passed, including skins/emotes/reload/fallback and actual AI entry cosmetics.
- Isolated draft regression passed: seat-specific skins, card backs, emotes, reconnect/frozen equipment and mobile fit.
- Isolated tower browser battle passed: actual attack → HUD fracture → result → reward → 25-card swap. Reward did not open before the KO sequence.

## Limits and protection

No physical Android/iOS session was available, and authenticated production matches were not created. Browser fixtures reproduce the confirmed error paths and exercise actual frontend entry/rendering; they do not establish that every possible device/network failure is solved. All backend-mode tests use isolated local data. No Production DB changes, champion/card records, source artwork, combat rules or reward policies were modified.

## Review captures

- [Actual AI intro, original portraits](https://raw.githubusercontent.com/jokingluigi/KO-CARD-GAME/c27eb4c056df2c6922a33cb273f4c9d1a5252f76/intro-originals-20261026.png)
- [HUD before the lethal hit](https://raw.githubusercontent.com/jokingluigi/KO-CARD-GAME/c27eb4c056df2c6922a33cb273f4c9d1a5252f76/champion-hud-before-20261026.png)
- [Fragments at the existing HUD position](https://raw.githubusercontent.com/jokingluigi/KO-CARD-GAME/c27eb4c056df2c6922a33cb273f4c9d1a5252f76/champion-hud-shatter-20261026.png)
