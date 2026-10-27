# Isolated sprite preview deployment

This is a separate disposable Render web service, not the production entry point. It serves the built game frontend and the real API/WebSocket routes with an independent on-disk PGlite database and an authenticated local upload store. No production database URL, Supabase secret, account, or inventory is copied. Startup refuses inherited database/storage configuration. Only original public image/audio object GETs may redirect to the existing public asset server.

Build (Node 24):

```sh
pnpm install --frozen-lockfile --prod=false
pnpm --filter @workspace/ko-game build
node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs scripts/sprite-preview/build.mjs
```

Start:

```sh
node --max-old-space-size=128 artifacts/api-server/dist-sprite-preview/index.mjs
```

Required environment: `KO_ISOLATED_SPRITE_PREVIEW=1`, dedicated `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`. Render provides `PORT` and `RENDER_EXTERNAL_URL`. For local smoke tests use `PREVIEW_ORIGIN` and optionally `PREVIEW_DATA_DIR`. Do not configure `DATABASE_URL` or Supabase credentials.

The build worker creates a closed database template containing only the dated 2026-10-12 QA card/champion catalog, without users or credentials. Runtime copies this template to its disposable directory to avoid memory-heavy initdb on a 512MB instance. The first start generates an independent administrator, collection, two legal decks and AI opponents. These are test-only inventory grants; the production grant/battle policies are unchanged. This catalog is not a claim that current production balance has been synchronized. Credentials belong only in host environment variables, never commits.

Signed uploads are limited to a 15-minute token bound to the object path. Signing, direct writes and backend downloads require a random server-only storage key. Image completion and manifest saving still pass the existing authenticated admin APIs and decoded-image validation. Uploaded objects are saved inside the isolated preview database, not in production storage.

**Free Render instances have ephemeral disk. Redeployment or instance replacement can erase the entire test database and uploaded sprites.** In-process/session reloads and normal process restarts on retained disk preserve data, but durable hosted retention is not promised. The page displays this limitation. Keep source sprite files locally. The local database file is not exported to production.

Administrator workflow: log into the preview address with the dedicated preview account; open `/admin/champions`, edit a champion, open **대사**, register the default appearance's battle sprite and save. For a selected skin use `/admin/cosmetics`, create/edit that champion skin and register its independent normal/awakened set. Use existing test-match or AI battle flows to inspect the resulting actual shared battle UI. No development QA page is published by the frontend production build.
