# Champion arena layout correction — 2026-10-27

Branch: `fix/champion-arena-composition`. No main merge, deployment, or production database changes.

## What was wrong

The preceding sprite work put the actor inside the original narrow portrait card and changed its grid column. It implemented skin/reaction selection, but did not deliver the requested battlefield composition. The earlier screenshots demonstrated that gap; they were not evidence of the requested visual overhaul.

## Changes

- The actual shared `GameStatePreview` opts into a named `ko-champion-arena` layout. This is not a separate production component or demo-only skin.
- Desktop has three columns: own commander wing, central four-slot fields, opposing commander wing. Own champion remains lower left, opposing champion upper right. Hands retain existing card size rules.
- Landscape at 740–999px uses narrower wings rather than the portrait stack.
- Portrait uses separate commander/HUD rows, wider face/shoulder regions, adjacent health/gold, and deck/graveyard controls below the image. Field cards retain their existing sizing. The board remains vertically scrollable; it does **not** fit all content into one viewport.
- Removed the old black portrait backing and gold card border from actor targets. Registered transparent assets keep their silhouette; existing illustrations are explicitly fallback artwork with a fading lower edge. Artwork is not automatically cut out or presented as a registered sprite.
- Fallback artwork defaults to top-aligned cover to avoid cropping off heads. Saved skin framing continues to override defaults. Registered expression framing remains unchanged.
- Existing champion refs and click/keyboard handlers remain the targeting and impact anchors. Decoration cannot intercept input. Skin resolution, awakening and reaction policy were not rewritten.

## Files

- `artifacts/ko-game/src/components/champion-battle-actor.css`
- `artifacts/ko-game/src/components/champion-battle-actor.tsx`
- `artifacts/ko-game/src/components/game-state-preview.tsx`
- `docs/qa/champion-arena-browser.mjs`
- This report and `screenshots/20261027-champion-arena/`.

## Actual verification

- `pnpm --filter @workspace/ko-game typecheck` — passed.
- `pnpm --filter @workspace/ko-game build` — passed.
- `node docs/qa/champion-arena-browser.mjs` — seven viewports: 360×740, 375×812, 390×844, 412×915, 844×390, 1024×768, 1440×900. No horizontal overflow, actor/field or hand/field overlap; no browser page errors.
- At 390×844 and 1440×900 the script clicks a field attacker and the actual relocated enemy champion target, checks decreased HP, then clicks a hand card and an empty slot and checks the engine's summoned card instance. These are actual pointer interactions in the shared battle component with the real local action engine, not live network matches.
- `node docs/qa/battle-actors-browser.mjs` — six viewport regression suite passed, including attack/ability reactions and broken selected-skin fallback isolation.
- Screenshots show cached, existing game illustrations/cards. The populated capture uses four published fixture cards whose original image files are available locally. It does not change a user deck or card data.
- `pointer-actions.mp4` records the 390px browser test, including scrolling, pointer attack and summon. It is silent and uses the local shared-component harness. It is not a PvP recording.

## Screenshots

- [Earlier mobile capture](screenshots/20261027-battle-sprites/after-390.png) — earlier one-field-card fixture with empty hand.
- [Current populated mobile](screenshots/20261027-champion-arena/mobile.png)
- [Earlier desktop](screenshots/20261027-battle-sprites/after-desktop.png)
- [Current populated desktop](screenshots/20261027-champion-arena/desktop.png)
- [Current landscape](screenshots/20261027-champion-arena/landscape.png)
- [Pointer attack/summon video](screenshots/20261027-champion-arena/pointer-actions.mp4)

The earlier and populated captures use different card arrangements. They compare composition, not card size or content.

## Incomplete / not verified

- No dedicated transparent champion sprites or expression artwork have been registered. Opaque original illustrations remain visibly rectangular fallback art. The final illustrated battlefield presence and face alignment with real sprites remain unverified; this correction is not a claim that the requested final art is finished.
- No new live PvP, AI, tower, draft, reconnect or administrator persistence runs were performed for this layout-only correction. Previous reports remain separate evidence, not new passes.
- No physical-device GPU, frame-time or touch accuracy measurements. Browser pointer tests do not establish real-player usability.
- Vertical scrolling remains on small and short screens; a fully viewport-contained board would require further information-layout work while preserving card sizes.
