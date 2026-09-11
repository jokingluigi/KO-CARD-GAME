ALTER TABLE "champions"
  ADD COLUMN IF NOT EXISTS "champion_token_effect_text" text,
  ADD COLUMN IF NOT EXISTS "champion_token_effect_effects" jsonb;