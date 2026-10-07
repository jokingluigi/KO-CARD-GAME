ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "retire_line" text;
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "destroy_line" text;
ALTER TABLE "champions" ADD COLUMN IF NOT EXISTS "game_start_ability_name" text;
ALTER TABLE "champions" ADD COLUMN IF NOT EXISTS "game_start_ability_text" text;
ALTER TABLE "champions" ADD COLUMN IF NOT EXISTS "game_start_ability_effects" jsonb;
