# Player-facing features 1–9

Implemented on the existing feature branch, using real player pages and the shared battle view. No main merge, server/schema/production DB changes, balance changes or changes to reward/ownership decisions. The only new runtime dependency is `html-to-image@1.11.13` (MIT); the notice is shipped at `/licenses/html-to-image.txt`.

| Request | Where/how to use | Implementation and boundaries |
|---|---|---|
| 1 Fast next match | Match result → same-deck next match / choose another deck | AI reuses actual Home start flow with a fresh match ID. Quick matching reuses the selected owned deck and existing queue, checks validity and joins once. Reward pending/errors and quest errors disable continuation. Friendly/draft/tower retain their existing lobby/continuation rules; this does not force the previous human opponent into another game. |
| 2 Deck records | Main menu / navigation → 내 기록; also AI deck selection | Account-scoped browser history, last 200 matches, grouped by known selected deck and mode, wins/rate and recent opponent champions. AI launch context and actual lobby handoffs supply identity; unknown decks are not guessed/grouped. This is not authoritative server ranking and is not synchronized across devices. |
| 3 Hand sort | Battle settings → 손패 정렬 | Draw order or current cost order. Only a copied display array is sorted, preserving actual hand/state order, stable instance identity and drag actions. |
| 4 Generated/token/transformed card links | Card detail → 생성·소환·변신 연결 카드 | Uses published card/champion metadata and explicit generation/transform references. Exact IDs or unambiguous exact names only; target filters and card prose do not imply generated cards. Linked cards open the existing detail dialog. Random results with no explicit reference remain explained by their rules text. |
| 5 Public opponent cards | Battle settings → 상대 공개 카드 | Keeps observed public board/play/reveal identities. Never reads concealed hand/deck for this feature or infers a privately discarded card. Tap a card for its base detail; this does not claim hidden current buffs are known. State resets per match/perspective. |
| 6 Card/skin goals | Card detail, cosmetics or pack skin detail → 수집 목표로 찜; 내 기록 to review/remove | Account-scoped browser goals, acquisition notices on inventory review and confirmed pack rewards. Uses actual returned card/cosmetic IDs, including legacy skin goal identifiers. Goals are presentation-only and never grant items. Existing favorites remain a separate browsing shortcut. |
| 7 Actual battle skin preview | Cosmetics / unowned cosmetic skin in pack details → 전투 액자·표정 미리보기 | Reuses actual portrait frame and ChampionBattleActor, with side, ten reaction/state controls, awakening and connected token artwork. Same skin/set fallback is preserved. Preview state is allocated only when opening the dialog and disposed on close. Isolated preview event metadata is never registered in the card catalog, persisted or sent to the server. |
| 8 Shared deck preview | Existing deck share/import dialog | Reuses existing champion/card preview, link decoding, missing-card validation and authorized import. Adds total missing quantity and average cost; server import validation/ownership checks are unchanged. |
| 9 Save a moment | Battle settings → current battlefield image; match result → keepsake image | Local PNG capture with KO branding, selected current art and a confirmed result label when finished. Finished exports capture the actual retained field rather than a fabricated match/mockup; settings controls are omitted. Uses native file sharing where available and download fallback. No upload, video recording or automatic highlight compilation. |

## Actual verification

- Frontend TypeScript and production build passed.
- 15 policy/deck validation tests passed: browser-account separation, corrupt JSON/quota handling, explicit card references and no hidden hand/deck reads, plus existing deck rules/availability checks.
- `player-tools-browser.mjs`, 390×844 and 1440×900: real cosmetics/collection/notebook pages; wishlist add, acquisition state, reload persistence; linked detail; preview attack, light/heavy hit, summon, surprise, low-health heal→low and heal→normal, victory/defeat, awakening replacement and opponent-side view. No page errors. Only default/awakened-default diagnostic art is registered; missing-expression fallback is deliberately exercised, not final ten-image artwork quality.
- `player-battle-tools-browser.mjs`, both viewports: actual shared battle, cost ordering and byte-for-byte unchanged game state, unchanged field bounds/no scroll, public-card dialog, locally executed confirmed lethal → result → deck record, no duplicate record, PNG download and file creation.
- `player-ai-rematch-browser.mjs`: actual Home → AI start → intro → surrender → mocked reward response → same-deck restart. Two different match IDs and the same deck ID verified. This is not a live reward claim/server replay test.
- `player-rematch-browser.mjs`: actual quick lobby/client with mock WebSocket; second deck preserved, exactly one queue join, cancellation does not requeue; invalid previous deck does not join.
- `player-pack-goals-browser.mjs`, both viewports: actual pack UI/open response/reveal/close → goal acquisition notice and persistence; exactly one mock pack-opening request.
- Existing collection regression passed at both viewports: skin comparison, search/reflow, card detail/crafting, pack unseal/reveal/skip/close. Server writes were mocked only.
- Existing eight-viewport no-scroll/resize suite passed; existing drag suite passed at 360×740, 375×812, 390×844, 412×915 and 1440×900.

## Review screens

[Skin preview mobile](screenshots/20261029-player-features/skin-390.png) · [PC](screenshots/20261029-player-features/skin-1440.png) · [Goals/notebook](screenshots/20261029-player-features/notebook-390.png) · [Pack goal notice](screenshots/20261029-player-features/pack-goal-390.png) · [Public cards](screenshots/20261029-player-features/public-390.png) · [Result controls](screenshots/20261029-player-features/result-ui-390.png) · [Downloaded PNG](screenshots/20261029-player-features/battle-export-390.png).

Screens are local actual components with mocked authenticated API responses and clearly marked diagnostic art, not live production user sessions or final sprite-art approval.

## Not verified / follow-up

Physical phones, native OS share sheets, real two-client PvP rematches/reconnects and production API reward/economy flows were not exercised. Account goals/history are browser-local; clearing storage removes them. Server persistence, cross-device synchronization, manual hand reordering and automatic highlight/video capture are not implemented. Legacy skins without the current cosmetic/sprite metadata keep their existing static preview. Final registered artwork alignment across every skin still needs review with those real assets.

## Files

New `components/player-tools/*` and `pages/player-notebook.tsx`; integrates with `App.tsx`, navigation/main menu, AI setup/Home, quick/friendly/online match pages, common battle/result/detail/share dialogs, cosmetics, collection, pack details and opening. Dependency/lockfile and MIT notice included. QA runners and explicit safe screenshots accompany this report. Game engine and server files are untouched.
