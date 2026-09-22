BEGIN;

ALTER TABLE "game_media"
  ADD COLUMN IF NOT EXISTS "main_enabled" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "notices" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "display_order" integer NOT NULL DEFAULT 0,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

COMMIT;