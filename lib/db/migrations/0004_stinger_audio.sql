ALTER TABLE "cards"
  ADD COLUMN IF NOT EXISTS "entrance_audio_asset_id" text,
  ADD COLUMN IF NOT EXISTS "entrance_audio_url" text,
  ADD COLUMN IF NOT EXISTS "entrance_audio_volume" integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "entrance_audio_enabled" boolean NOT NULL DEFAULT false;

ALTER TABLE "champions"
  ADD COLUMN IF NOT EXISTS "quest_complete_audio_asset_id" text,
  ADD COLUMN IF NOT EXISTS "quest_complete_audio_url" text,
  ADD COLUMN IF NOT EXISTS "quest_complete_audio_volume" integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "quest_complete_audio_enabled" boolean NOT NULL DEFAULT false;