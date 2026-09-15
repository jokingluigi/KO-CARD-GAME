CREATE TABLE IF NOT EXISTS "card_frame_definitions" (
  "id" text PRIMARY KEY NOT NULL,
  "card_type" text NOT NULL,
  "rarity" text NOT NULL,
  "frame_asset_id" text,
  "frame_url" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "frame_scale" real NOT NULL DEFAULT 1.1,
  "frame_offset_x" real NOT NULL DEFAULT 0,
  "frame_offset_y" real NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "card_frame_type_rarity_unique" UNIQUE("card_type", "rarity")
);