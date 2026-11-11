# Champion saving and AI deck editing — 2026-11-11

## Changes and causes

Champion edits downloaded and validated already registered sprite URLs again, then waited for obsolete asset cleanup after the database transaction. Cleanup failures could report an error despite a committed save. The frontend also waited for unrelated catalog refreshes before reporting success.

Existing registered sprite URLs are now reused; new URLs retain upload validation. Version conflicts are detected before sprite I/O. Committed edits return immediately, and cleanup failures are logged separately. The client updates its saved record directly. Lost/ambiguous write responses are confirmed by an uncached read of the exact champion and full persisted-value comparison. New champions use a stable UUID idempotency key to prevent duplicate creation on retry. No schema change is needed.

AI skins now have a dedicated **스킨 · 외형** tab with champion and wrestler selectors, artwork previews, copy counts and invalid-skin removal. Skin storage and battle rendering use the existing system. AI-only legacy skin lookup permits enabled draft base cards; it does not publish them or grant inventory.

**덱 구성 → 공유 덱 코드 가져오기** accepts the existing KO1 deck code or shared link. Applying replaces the draft champion and 25 cards; it preserves an existing AI name and difficulty. Compatible skins remain selected. Invalid/missing/disabled/token cards are rejected without clearing the draft. Current balance data is used and revision differences are reported. Press the normal save button to persist the imported deck.

## Verification actually executed

- Focused unit, real HTTP route and Playwright checks: **26 passed, 0 failed**.
- Existing AI cosmetics regression checks: **28 passed, 0 failed**.
- `pnpm build`: passed (type checks and production bundles).
- Actual champion PATCH committed, then a simulated lost response was recovered in the browser: one write, no post-save catalog list requests.
- Existing sprite save avoids downloads; a new unknown sprite URL still fails validation. Stale versions return conflict.
- Storage cleanup failure still returns saved success. Concurrent identical creation keys create one champion; changed payload is rejected.
- AI wrestler skins and shared-code imports saved and reloaded through actual routes.
- Actual `/ai-match?source=admin&aiDeckId=…` ran with the common game engine and AI scheduler. An opponent wrestler appeared on the field using its assigned skin.
- Portrait 390×844, landscape 844×390 and PC 1440×900 admin layouts checked without horizontal overflow.

All write tests ran against isolated PGlite fixtures. Temporary artwork was served for browser checks; this does not validate newly uploaded production artwork or every combat mode. No Production DB data was edited by these checks. Card/champion effects, ownership and game rules were unchanged. Full gameplay regression and live two-client PvP were not run for this UI/save change.

## Files

- `artifacts/api-server/src/routes/admin.ts`
- `artifacts/api-server/src/lib/ai-deck-cosmetics.ts`
- `lib/game-engine/src/champion-save-values.ts`
- `artifacts/ko-game/src/lib/champion-save-client.ts` and its test
- `artifacts/ko-game/src/lib/ai-deck-import.ts` and its test
- `artifacts/ko-game/src/components/admin-champion-manager.tsx`
- `artifacts/ko-game/src/components/admin-ai-deck-manager.tsx`
- `artifacts/ko-game/src/components/ai-deck-code-import.tsx`
- `artifacts/ko-game/src/components/ai-deck-skin-editor.tsx`
- `docs/qa/champion-save-ai-skins-20261111.test.mjs`

Screenshots, browser results and logs are in this directory. Deployment verification is recorded separately after release.
