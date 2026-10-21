# Quest replay and battle HUD fixes — 2026-10-21

## Reproduction and change

The reported `공격할 수 없는 선수입니다` is raised during result replay when the attacking instance is absent from the replayed board; it does not mean the user's completed attack was refused in the displayed match.

A deterministic regression reproduced the exact error: a human sends a champion emote while the AI scheduler awaits presentation/thinking; the scheduler commits its captured pre-emote state, discarding an event already included in the result transcript. Generated-card instance IDs depend on event position, so a later recorded token attack references an instance absent from server replay. The regression failed before the fix and passes afterward. This demonstrates a concrete cause of the reported symptom; the user's original full transcript was not available to prove which race occurred in that particular match.

The AI scheduler now reads the committed state after asynchronous pauses and chooses/executes from that state. It stops when a surrender or timeout has finished/transferred the turn, including during its forced turn-end wait. Home synchronously updates the shared state reference for AI commits and human emote, mulligan, surrender and timeout commits. AI timeout END_TURN is included in the transcript rather than silently skipped. Engine combat rules and replay legality checks are unchanged; forged/missing-card attacks remain rejected.

The graveyard now uses CardRenderer with actual artwork, frame, runtime statistics/keywords, skin ownership, and detail inspection. Selecting a card for the existing return-to-deck effect still invokes its target action without opening a blocking inspector. HP and gold occupy the top left of both champion HUDs, with larger numeric text; deck and graveyard occupy the bottom left. Original hand-card dimensions, portrait contain fitting, frames, materials and action coordinates remain intact.

The earlier PR #65 CI failure was separately traced through GitHub check annotations to an obsolete art-direction assertion demanding a pure-black battle background. It now verifies the approved walnut resource/base, hidden legacy backdrop, opaque black card interiors and actual row/card bounds. The new actual-Home replay race browser test is included in that CI workflow.

## Completed validation

- Workspace typecheck and frontend/API build: PASS.
- Focused replay, AI scheduler, combat, champion and animation tests: 66 PASS.
- Isolated authenticated quest platform HTTP tests: 7 PASS, 1 optional browser-profile case SKIPPED (not enabled); duplicate completion/claims and user separation verified.
- Isolated PGlite HTTP/WebSocket mode suites: PvP/cosmetics 14, Draft 18, Tower 11 PASS.
- Real shared UI: 40 groups PASS across 360×740, 375×812, 390×844, 412×915. Includes drag summon/attack, targeting/cancel, quest ability, destruction, actual graveyard card/detail and return selection, scrolling and HUD restoration.
- Actual Home AI start → emote/AI-timeout/surrender → submitted transcript → server replay: 3 browser scenarios PASS. The timeout transcript contains an AI END_TURN. No quest-progress error shown.
- Actual compiled production bundle with local authenticated servers: PvP/AI 8 groups, Draft 4 groups and Tower battle/KO/result/reward/deck swap 1 group PASS. Two browser sessions verify equipment/emotes/reconnection.
- Existing art-direction regression: 30 screen/interaction checks PASS, including desktop, 390×844 and 320×568, with no horizontal overflow or page errors.
- Offline real-art capture: five viewports, ten new/classic renders, zero page errors and missing images; original hand dimensions unchanged. Initial captures taken while source/HMR changed were discarded; the stable rerun passed. One additional public illustration was fetched read-only into the local cache for the return-card regression; tests themselves use the cache.
- Production bundle gate: board CSS/materials present, development QA scene/legacy opt-in excluded.

## Scope and limitations

No schema migration, production database mutation, production test account, grant, purchase or deck write was performed. Tests use dated repository content and isolated fixtures; they do not certify every current production effect. No new production image assets or DB queries were added. Physical-phone/Safari verification and live production two-account gameplay were not performed. Previously corrupted/lost transcripts are not automatically repaired or bypassed; retry remains subject to valid server replay. Other network/storage failures can still produce a truthful save error.

Screenshots are actual Chromium mobile-emulation renders: [390px battle](battle-390x844.png), [360px battle](battle-360x740.png), [graveyard](graveyard-390x844.png).
