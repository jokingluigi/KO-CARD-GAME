# Dedicated battle sprite administration — 2026-10-27

## Change

Added `/admin/battle-sprites` under the separate **스프라이트 관리 → 대전 스프라이트** navigation group. Champion and cosmetic editing retain links to the selected target; the small embedded sprite editors were removed. No second asset store or schema was added.

The workspace chooses a champion and that champion's default appearance or individual skin. Desktop places a large sticky preview beside the controls. Portrait stacks the large preview above the controls. It offers current-expression framing and actual shared state/reaction selection modes, both viewer positions, low-health/awakening/self-damage toggles, reaction playback and native full-screen enter/exit where supported. The normal canvas is at least 420px tall (650px at a 1000px viewport height), compared with the previous 160px reaction preview / 128×176px framing box.

Uploads and framing controls are first; detailed mappings, thresholds and durations are in an expandable section. Uploads disable save/target switching immediately. Unsaved changes participate in the existing admin draft guard. The existing test-game link uses the saved champion and currently equipped skin; selecting a skin in this editor does not silently equip or grant it.

## Persistence and protection

- Reuses champion `presentationLines.BATTLE_SPRITE` and each skin's `imageAssets.__battle`.
- New administrator-only GET/PATCH endpoints edit only these sprite fields. They merge into current JSON under a row lock, preserve unrelated dialogue, artwork, targets, ownership and effects, and reject stale sprite revisions with 409.
- Revisions use recursively canonicalized JSON so PostgreSQL JSONB key ordering does not produce false conflicts after saving.
- Upload verification reuses existing decoded-image/storage validation. Only server-owned, previously verified frame URLs are skipped when saving framing-only changes; client-provided allow-lists are not accepted.
- Champion version/updatedAt advance for cache/editor consistency. No gameplay or inventory grants occur.

## Actual tests

- Full workspace typecheck; final frontend/API typechecks and builds passed.
- Six administrator navigation tests passed, including the distinct sprite route, search and preserved existing route aliases.
- Twenty-six isolated DB/API tests passed (existing cosmetics/pack regressions plus three new workspace groups). They cover authentication, sprite-only updates, concurrent unrelated dialogue preservation, stale saves, artwork/target/active-state preservation, invalid awakening replacement and external image rejection, and unregister.
- Actual Chromium with the real isolated API/storage fixture passed in development and in the built production frontend at 390×844 and 1440×1000: selected skin, PNG upload, per-side scale/flip, reaction mapping, save/reopen, independent awakened set, missing awakened reaction fallback, reaction timeout, full-screen enter/exit, unregister and no horizontal overflow/page errors.
- The first implementation exposed two issues caught before deployment: initialization ordering of the lazy administrator module in Vite, and non-canonical JSONB revision comparison. Both were fixed and the corresponding suites rerun.

[Desktop workspace](screenshots/20261027-sprite-workspace/desktop.png) · [Mobile fullscreen](screenshots/20261027-sprite-workspace/mobile-fullscreen.png).

The purple rectangle is an explicitly temporary image-validation fixture, not a registered champion sprite or a final-art claim. Native fullscreen was tested in Chromium; other browsers and physical-device touch/performance are unverified. Existing actual battle rendering/reaction selection was reused, but no new live combat-mode matrix was run for this administrator workflow change.

## Changed source

`admin-battle-sprites.ts` (API route), API route index, `admin-battle-sprites.tsx`/`.css`, `battle-sprite-editor.tsx`, the champion/cosmetic editor links, administrator page/navigation, and the relevant navigation/API/browser tests. No card/champion rule, combat engine, reward, ownership or database schema changes.
