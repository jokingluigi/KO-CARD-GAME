ALTER TABLE "champions"
  ADD COLUMN IF NOT EXISTS "image_display_mode" text DEFAULT 'COVER' NOT NULL,
  ADD COLUMN IF NOT EXISTS "image_scale" real DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS "image_position_x" real DEFAULT 50 NOT NULL,
  ADD COLUMN IF NOT EXISTS "image_position_y" real DEFAULT 50 NOT NULL;