BEGIN;

ALTER TABLE "game_media"
  ADD COLUMN IF NOT EXISTS "game_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "title_enabled" boolean NOT NULL DEFAULT false;

UPDATE "game_media"
SET
  "game_enabled" = "enabled",
  "title_enabled" = "main_enabled";

COMMIT;