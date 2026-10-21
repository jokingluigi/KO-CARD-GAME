# Reviewed battle board production activation

The user approved deployment of the complete reviewed board and both Render services on 2026-10-21. This supersedes the preview-only deployment restrictions in the earlier review reports. No database migration or direct production data modification is required.

The board now defaults on in the shared `GameStatePreview`, independently of DEV and browser session storage. `CLASSIC` remains an explicit comparison prop. The reviewed CSS is imported by the battle component, and main loads base CSS before App so production lazy CSS follows the legacy responsive cascade. The original development-only QA page remains excluded from the normal bundle.

Production gate confirms both walnut WebP materials and the linen/board CSS are included, while QA entry points and the obsolete browser opt-in string are excluded. Both frontend and API service build/start commands were checked for migration commands; none were found. Free service plans and server environment settings are unchanged.

## Pre-deployment validation

- Full workspace types and build: PASS, including frontend and API.
- Focused engine/presentation unit tests: 60 PASS.
- Isolated PGlite HTTP/WebSocket regressions: PvP/cosmetics 14, Draft 18, Tower 11 PASS.
- Shared UI real action paths at four mobile sizes: 36 browser groups PASS.
- Actual built production assets: PvP/AI 8 browser groups, Draft 4, Tower battle/KO/result/reward/card swap 1 PASS. Battle screenshots and geometry confirm the centred matching portraits, no horizontal overflow, and use of `/assets/` production scripts. No DEV opt-in is injected.
- Existing attack-drag 4 viewport groups and targeting-layout 4 widths: PASS.
- Five viewport captures/ten new-versus-classic renders: PASS, no page errors or missing offline illustrations.

The initial release trial exposed base CSS overriding the new theme when imported inside index.css. It was corrected by loading base CSS before App and importing board CSS with the shared battle component. The first local production PvP trial also used the application's fixed production WebSocket destination; the QA adapter now redirects only that destination to the isolated local ticket/WS server and blocks external HTTP. Production application transport code was not changed. The final compiled tests use real local server events, not fabricated responses.

Prior preview reports remain historical. Physical phones/Safari, live production two-account gameplay, timer expiry and exhaustive card-effect scenarios were not run. No production test accounts, purchases, grants or decks were created.

## Release

PR #65 contains only the reviewed board/visual assets, production activation and QA/report files; no engine, server, schema or card-data changes. The user requested both frontend and API deployment, so merge to main is intended to trigger both existing Render auto-deploy services. Service IDs: static `srv-damlm4gu01pc73ao3mb0`, API `srv-daml9kqd0e5s73fsnjs0`. Verify both become live on the merged commit, then verify public HTML/JS/CSS/materials and API health. Rollback target is the previous deployed main `ac30343bab4758da185160df8dd6834008965e95`.
