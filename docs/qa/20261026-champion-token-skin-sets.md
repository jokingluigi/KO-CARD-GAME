# Champion skin sets and missing-original acquisition

## Behavior

- Administrator Cosmetics → champion skin: upload the new **세트 포함 챔피언 토큰 일러스트** slot. The slot uses the champion's existing `championTokenDefinitionId`; administrators cannot attach another champion's or ordinary card's ID.
- The champion skin owns both appearances. Adding token art to an existing skin works for existing owners without another inventory grant. Equipping/removing/revoking/disabling that skin includes/removes its token appearance. Missing art falls back to the original renderer. In-progress matches retain their frozen cosmetics.
- Administrator Packs → existing Skin Pool: active champion cosmetics on published champions are now selectable beside existing card skins. Pool chance and uniform selection rules remain unchanged. No catalog entries or pack pools were edited in production.
- Pack results display the champion/token pair. Normal and bulk openings can award `CHAMPION_SKIN`; legacy `SKIN` rewards remain supported.
- On a skin drop, the same existing pack-claim transaction grants one missing original card, or unlocks the missing original champion. A zero-count/false-owned row is restored. Already-owned originals are not incremented; skin duplicates do not generate champion duplicate prisms. Retry keys replay the original result without granting again. Actual extra acquisition is identified by `originalGranted` in results.
- Applies to future pack openings. No historic ownership backfill was executed.

## Implementation boundaries

No new tables, migrations, card/champion definitions, combat effects, engine rules, source artwork, or altered pack probabilities. Optional token URLs use `image_assets["token:<definition ID>"]` in the existing cosmetics JSON. The authoritative equipped-loadout query filters token keys against a currently valid linked champion token. Public rendering resolves by controller and final definition ID. Token rendering is connected in hand, board, graveyard/details, summon and leave paths.

The token artwork must be uploaded by an administrator; this feature does not generate art or copy champion art over the token automatically. Registration without token artwork preserves the original token appearance.

## Verification

- Production typecheck and build passed.
- 12 pack-codec/client unit tests passed.
- 16 isolated PGlite + actual authenticated HTTP/WS tests passed: existing permissions/equipment/PvP/recovery, validated token linkage, existing-owner entitlement, single/bulk/replayed acquisition, zero/missing-original card rows, champion unlock, transaction rollback, stale-link fallback, forced pack preview and the existing pack-transaction regression.
- Dedicated Chromium checks passed at 360×740, 375×812, 390×844, 412×915 and 1440×900: actual administrator token upload/save, actual pack opening/reveal, original-unlock notice, actual equipment UI, actual PvP board token art and frozen opponent fallback, no document horizontal overflow.
- Existing cosmetics browser regression: eight groups passed, including actual local AI start, two-user PvP screens and emotes, reload, equipment, mobile layout and failed-image fallback.
- Existing draft regression: 18 isolated HTTP tests plus four actual-browser groups passed (two participants, frozen equipment, emote delivery, reload and mobile layout).
- All tests used isolated local accounts/database/storage. Their colored artwork is an explicit fixture, not a production skin asset or final art-quality demonstration.

Local artifacts: `qa-results/champion-skin-set/` (screenshots/results), `qa-results/cosmetics/` (existing regressions). Credentials in local fixture JSON are deliberately not tracked or published.

## Limits

Physical Android/iOS hardware was not tested. Token-specific gameplay in AI, tower and draft was not individually replayed; those modes share the same presentation resolver. No new combat or economic calculation beyond the explicitly requested missing-original pack grant was introduced.

## Changed files

- `artifacts/api-server/src/lib/cosmetics.ts`
- `artifacts/api-server/src/lib/pack-details.ts`
- `artifacts/api-server/src/lib/pack-opening-service.ts`
- `artifacts/api-server/src/routes/admin-packs.ts`
- `artifacts/api-server/src/routes/collection.ts`
- `artifacts/api-server/src/routes/cosmetics.ts`
- `artifacts/api-server/src/routes/packs.ts`
- `artifacts/ko-game/src/components/admin-cosmetics.tsx`
- `artifacts/ko-game/src/components/alt-inspector.tsx`
- `artifacts/ko-game/src/components/card-leave-animation.tsx`
- `artifacts/ko-game/src/components/card-play-animation.tsx`
- `artifacts/ko-game/src/components/cosmetic-preview.tsx`
- `artifacts/ko-game/src/components/game-state-preview.tsx`
- `artifacts/ko-game/src/components/pack-detail-dialog.tsx`
- `artifacts/ko-game/src/components/pack-opening.tsx`
- `artifacts/ko-game/src/lib/collection-client.ts`
- `artifacts/ko-game/src/lib/cosmetics-client.ts`
- `docs/qa/cosmetics-browser-runner.mjs`
- `lib/api-client-react/src/generated/api.schemas.ts`
- `lib/api-spec/openapi.yaml`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/packRewardRewardType.ts`
- `lib/cosmetics/src/index.ts`
- `lib/db/qa/cosmetics.test.ts`
- `artifacts/api-server/src/lib/champion-skin-pool.ts`
- `artifacts/api-server/src/lib/skin-original-grant.ts`
- `docs/qa/champion-skin-set-browser.mjs`
- `docs/qa/20261026-champion-token-skin-sets.md`
