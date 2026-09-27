ALTER TABLE "champions" ADD COLUMN IF NOT EXISTS "presentation_lines" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "summon_line" text;
