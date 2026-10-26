# Unified cosmetics catalog and KO champion dialogue

Base: `1aa30ef` (PR #93). Work branch: `feat/ko-champion-result-dialogue`.

## Behavior

- `/admin/cosmetics` and historical `/admin/skins` now open one list/editor. Type filtering separates card/champion skins, backs and emotes without separate legacy tabs.
- Existing pack skins appear once with their existing name/art/target and unpublished/published/disabled status. The same editor provides upload, edit, grant/revoke and guarded deletion.
- Original `card_skin_definitions` IDs, pack pools/probabilities and `user_card_skin_collections` remain authoritative for historical pack rewards. A stable `pack-skin:<original ID>` presentation item bridges existing owners into the established ownership/equipment service. It is not an extra roll entry.
- Entitlement hydration rereads actual ownership under the shared cosmetics write lock, inserts idempotently and does not grant original cards, champions or currency. Revoke/delete remove both presentation and historical entitlement. Packs referencing a skin block deletion until the administrator removes that reference. No schema or manual production data migration.
- New card skins registered in this editor use the existing pack catalog as well, so the existing pack editor can select them. Champion skin/token sets and other cosmetic types keep their existing storage and acquisition rules.
- Old card-skin HTTP endpoints still work and synchronize the same presentation item. Existing modern skins stay supported. Spell card previews use their real card type.
- Both champion victory/defeat lines now appear at the actual in-HUD portrait burst callback. Existing quest-phase and champion-matchup lines resolve by winner/loser IDs; no new dialogue is generated. The result screen does not repeat them.
- Dialogue uses pointer-transparent bubbles anchored to both HUD portraits, with viewport/overlap constraints. A 2.6-second reading window holds only result presentation. Existing combat rules, timers, rewards, shatter animation and sound are unchanged. Finished-match reconnect does not replay the KO sequence; empty dialogue adds no reading delay.

## Changed implementation files

- `artifacts/api-server/src/lib/legacy-skin-cosmetics.ts`: stable legacy catalog/entitlement adapter, grant/revoke/deletion.
- `artifacts/api-server/src/lib/cosmetics.ts`: hydrate actual legacy owners for inventory/equipment; support normal spell skins.
- `artifacts/api-server/src/routes/cosmetics.ts`: unified catalog CRUD/grants; new card skins remain pack eligible.
- `artifacts/api-server/src/routes/admin-card-skins.ts`: backwards-compatible endpoints synchronize/delete the same items.
- `lib/cosmetics/src/index.ts`: optional legacy ID/publication metadata, no database columns.
- `artifacts/ko-game/src/components/admin-cosmetics-hub.tsx`: both routes share one editor.
- `artifacts/ko-game/src/components/admin-cosmetics.tsx`: type filter, unified legacy editing/status, shared actions.
- `artifacts/ko-game/src/components/cosmetic-preview.tsx`, `src/lib/cosmetics-client.ts`, `src/pages/cosmetics.tsx`: actual card-type preview and common card-skin label.
- `artifacts/ko-game/src/components/champion-defeat-burst.tsx`: callback at the existing burst frame.
- `artifacts/ko-game/src/components/champion-ko-lines.ts`, `champion-ko-dialogue.tsx`, `champion-ko-dialogue.css`: existing-line resolution and dual HUD speech.
- `artifacts/ko-game/src/components/game-state-preview.tsx`: shared KO speech lifecycle/presentation gate.
- `artifacts/ko-game/src/components/match-result-overlay.tsx`: remove duplicate result-screen dialogue.

## Executed validation

| Check | Result |
|---|---|
| `pnpm run build` (includes full typecheck) | PASS |
| `cosmetics.test.ts` + `champion-ko-lines.test.ts` | 24 PASS, 0 failed, 0 skipped |
| Existing cosmetics browser suite | All 8 groups PASS; authenticated PvP, AI start, equipment, four emote slots, reload, fallbacks |
| Unified cosmetics actual browser | 360×740, 375×812, 390×844, 412×915, 1440×900 PASS: historical route, one entry, same legacy edit, filters, original owner's equipment persistence, no horizontal overflow |
| New card-skin actual UI flow | Upload → save → existing pack options → admin grant → user equip → delete both representations PASS |
| Draft cosmetics actual browser | All 4 groups PASS: two seats, frozen skins/backs, emotes, reload, mobile |
| Compiled auth/startup recovery browser | PASS, including updated unified-list dirty-draft cancellation and confirmation at 390/1440 |
| KO/intro browser | Four mobile widths and desktop PASS: real lethal engine action, both speech bubbles at burst, viewport bounds/nonoverlap, actual HUD shatter, result overlay without duplicate lines, busy release |
| Reduced motion KO browser | 390×844 victory/defeat PASS, no fragment movement, readable speech, busy release |
| Finished-match reconnect | PASS: no shatter/speech replay |

Commands:

```sh
node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test --test-isolation=none lib/db/qa/cosmetics.test.ts artifacts/ko-game/src/components/champion-ko-lines.test.ts
KO_QA_PLAYWRIGHT=$PWD/docs/qa/black-gold-playwright.mjs KO_COSMETICS_BROWSER_SCRIPT=docs/qa/unified-cosmetics-browser.mjs node docs/qa/cosmetics-browser-runner.mjs
KO_COSMETICS_DRAFT=1 node docs/qa/cosmetics-browser-runner.mjs
KO_QA_PLAYWRIGHT=$PWD/docs/qa/black-gold-playwright.mjs KO_AUTH_QA_SCRIPTS=auth-startup-recovery-browser node docs/qa/auth-startup-browser-runner.mjs
node docs/qa/ko-champion-dialogue-browser.mjs
KO_INTRO_KO_REDUCED=1 KO_INTRO_KO_SIZES='[[390,844]]' node docs/qa/ko-champion-dialogue-browser.mjs
```

Local screenshots/results: `qa-results/unified-cosmetics/`, `qa-results/ko-champion-dialogue/`, `qa-results/ko-champion-dialogue-reduced/`. Test fixture credentials are excluded from commits. The isolated fixture uses a colored test image to verify asset binding, not replacement production artwork.

## Limits

No real-user usability study. Tower end-to-end KO, live PvP KO, real device audio and full production transactions were not exercised by this change. Shared KO rendering was exercised using actual engine lethal actions; ordinary PvP/AI/draft integrations were tested separately. Server combat, original card/champion definitions, store/reward policy and production data were not edited.

Previously known hosted CI issues are independent: the broad heavy-impact browser expects older audio aliases/shake limits, and auth CI browser installation has timed out. Local scoped checks above pass; hosted failures must not be represented as green. Existing approved impact effects were not weakened to satisfy those old expectations.
