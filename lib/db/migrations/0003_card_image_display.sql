ALTER TABLE "cards"
  ADD COLUMN IF NOT EXISTS "image_display_mode" text NOT NULL DEFAULT 'COVER',
  ADD COLUMN IF NOT EXISTS "image_scale" real NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "image_position_x" integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "image_position_y" integer NOT NULL DEFAULT 50;