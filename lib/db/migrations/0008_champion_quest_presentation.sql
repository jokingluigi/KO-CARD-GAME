ALTER TABLE "champions"
  ADD COLUMN IF NOT EXISTS "quest_completed_portrait_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "champions"
  ADD COLUMN IF NOT EXISTS "quest_completed_portrait_asset_id" text;
ALTER TABLE "champions"
  ADD COLUMN IF NOT EXISTS "quest_completed_portrait_url" text;