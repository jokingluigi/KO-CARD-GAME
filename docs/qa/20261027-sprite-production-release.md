# Sprite system production test release — 2026-10-27

The user explicitly changed the deployment target from a separate test service to the existing production site under maintenance. The earlier no-deployment instruction is superseded only for this requested release. Main was not merged.

Released commit: `89006bc17d4c33eab22b1726bf18afd668350b5b` on `fix/champion-arena-composition`.

- API: `dep-dbgce6gn74is73cinvg0` — live at that exact commit.
- Frontend: `dep-dbgce6qjnfac73ft3mf0` — live at that exact commit.
- Both services still track `main`; manual `commitId` deployment selected this branch commit without merging it.
- Automatic deployment was changed from `yes` to `no` on both services for this branch-based test release, so an unrelated main deployment does not silently replace it. It remains paused.
- Maintenance was enabled through the existing authenticated administrator endpoint. The existing maintenance message was preserved. Anonymous `/api/server-status` reports `enabled: true`, `allowed: false`; normal administrator authentication and editor access succeeded.
- The unused separate preview service `ko-sprite-preview` was suspended after the user changed the target. Its test storage/database is independent of production.

## Verification

- Full workspace typecheck and normal API build passed before release; the frontend build and seven-viewport/pointer tests are recorded in the preceding size/composition reports.
- Both host deployments were confirmed live at the release commit.
- A fresh production entry document references the new assets. The served lazy-loaded `match-result-overlay-ZxMuLulE.css` contains the champion arena and actual 200px portrait / 400px desktop / 280px landscape height settings.
- The old root entry document was briefly cached (`s-maxage=300`). A `sprite_release` query forces a fresh entry document. Looking only at the entry CSS is insufficient: arena CSS is in the lazy battle/result dependency.
- Authenticated Chromium at 390×844 opened the real production champion editor, selected the dialogue panel, and found the sprite file input and awakening selector without page errors. No production champion or skin manifest was saved and no test image was uploaded to production.
- The first browser assertion used an overly strict accessible-label match for the awakening select; using the visible label's actual select resolved that test-locator issue. It was not evidence of a missing production field.

## Scope and follow-up

This release includes the skin-bound sprite/reaction registration system and enlarged diagonal battle layout. Dedicated transparent sprites remain unregistered; the user will supply them. Selected skins must be configured in their own cosmetic editor; default appearance uses the champion editor's dialogue section.

No account/deck/card/balance/reward changes or production schema migration were performed by this release. The only deliberate system-data change was maintenance mode. The previously approved but technically blocked `0055_ai_deck_cosmetics.sql` table remains a separate unapplied item; do not infer its success from this sprite deployment.

Maintenance stays enabled and automatic deployment stays paused until the test release is deliberately concluded. Do not restore an old main deployment accidentally while the user is testing.
