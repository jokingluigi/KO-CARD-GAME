# Common champion artwork and administrator deletion audit

## Champion skins

The editor now has one **챔피언 일러스트 · 전투·VS 공용** upload instead of three duplicate regular-image fields. `championSkinArtwork` resolves `art`, then legacy `portrait`/`intro` records, for all three normal display contexts. New common uploads take precedence over preserved old slot bindings. Explicitly clearing the common field also clears its old bindings. Awakening and linked-token artwork remain separate; missing awakening art retains the original awakening fallback. No original champion/card records or artwork files were changed, and no bulk data migration was needed.

## Administrator audit

| Area | Result |
| --- | --- |
| Notices | Added confirmed deletion in the editor and authenticated DELETE API; removed notices also disappear from the public feed. |
| Cosmetics: champion/card skins, backs, image emotes | Added confirmed deletion, ownership/equipment cleanup and DELETE audit. Images and frozen match/pack receipts remain readable. Referencing non-deleted packs block deletion and name the dependency. |
| Existing pack-card skins | Deletion already existed; added pack-reference protection and clearer confirmation. |
| Shop deck products | Added confirmed deletion. Products with purchase receipts are protected; use the existing sale-stop control for those records. |
| Quest seasons | Added confirmed deletion and audit. Live quest definitions or assigned quest/history records block it; archive remains available. |
| Tower V1/V2 definitions, starters, AI presets, relics, characters, scenes, metadata | Added deletion in both authoring workspaces. Current catalog dependencies are named; active seasons, published versions and run history protect their parent season. Deleting metadata does not delete original cards/champions. |
| Cards, champions, intro interactions, packs, individual shop listings, AI decks, tags, media, card frames | Existing deletion controls/APIs were found. |
| Quest definitions | Existing logical deletion preserves already assigned quests/progress/rewards. |
| Tower floor/boss/enemy rows | Existing in-draft removal controls were found. |
| Draft options, prism economy, attendance/reward schedules, global toggles | Fixed settings, not append-only catalog entries; retain disable/reset/configuration controls. |
| Users, purchase receipts, result/reward/progress history, published immutable tower versions | Retained; no new history-erasure endpoints. |

Pack writes share the cosmetics deletion lock and reject missing skin IDs so a concurrent stale save cannot reattach a deleted skin. Tower catalog edits/deletion/publication and quest catalog edits/deletion share their corresponding write locks. The tower HTTP helper now honors a bodyless DELETE rather than silently sending GET. No combat rules, economy amounts, existing player decks or source card/champion definitions were changed. No schema migration or manual production content deletion was performed.

## Validation

- Common-art resolver: 5 tests passed, including single upload for all regular contexts, legacy slot-only records, common precedence, separate awakening and token/opponent isolation.
- Isolated authenticated HTTP/WS/database fixture: 21 tests passed. Added permission denial, notice feed removal, pack-reference rollback, ownership/equipment cleanup, image/history preservation, idempotent missing-item behavior, deleted-skin reattachment rejection, product receipts, quest assignments and all editable tower resource types.
- Existing shop deck regression: 22 passed.
- Existing quest platform regression: 7 passed; 1 opt-in full browser test skipped (not reported as passed).
- Existing tower V2 regression: 11 passed, including authoritative battle/immutable configuration paths.
- Existing cosmetics browser regression: all 8 administrator/ordinary-user/AI/PvP/reload/mobile/fallback groups passed.
- Actual local browser: a single admin upload → cosmetics preview → AI VS intro → battle HUD uses the same newly uploaded image; editor checked at 360, 390 and 1440px widths.
- Actual administrator deletion UI at 390×844, 360×740 and 1440×900: notice/skin cancellation and deletion, public feed refresh, deck-product deletion, quest-season deletion, tower resource and V2 draft deletion; screenshots and results under `qa-results/admin-deletion/` and `qa-results/champion-common-art/`.

All mutation tests used isolated local accounts, PostgreSQL-compatible storage and image fixtures. Physical devices were not tested. The prior broad CI impact-contract failure and browser-tool timeout remain disclosed in PR91; this work does not change the approved combat camera/audio implementation or claim those checks passed.

## Changed files

- `artifacts/api-server/src/lib/pack-details.ts`
- `artifacts/api-server/src/routes/admin-card-skins.ts`
- `artifacts/api-server/src/routes/admin-packs.ts`
- `artifacts/api-server/src/routes/admin-quests.ts`
- `artifacts/api-server/src/routes/admin-tower.ts`
- `artifacts/api-server/src/routes/cosmetics.ts`
- `artifacts/api-server/src/routes/main-content.ts`
- `artifacts/api-server/src/routes/shop-decks.ts`
- `artifacts/ko-game/src/components/admin-card-skin-manager.tsx`
- `artifacts/ko-game/src/components/admin-cosmetics.tsx`
- `artifacts/ko-game/src/components/admin-notices-manager.tsx`
- `artifacts/ko-game/src/components/admin-quest-manager.tsx`
- `artifacts/ko-game/src/components/admin-shop-decks.tsx`
- `artifacts/ko-game/src/components/admin-tower-manager.tsx`
- `artifacts/ko-game/src/components/admin-tower-v2.tsx`
- `lib/cosmetics/src/index.ts`
- `lib/db/qa/cosmetics.test.ts`
- `artifacts/api-server/src/lib/admin-content-deletion.ts`
- `artifacts/ko-game/src/lib/champion-skin-art.test.ts`
- `docs/qa/admin-deletion-browser.mjs`
- `docs/qa/champion-common-art-browser.mjs`
- `docs/qa/20261026-admin-deletion-common-art.md`
