CREATE TABLE IF NOT EXISTS "game_media" (
  "id" text PRIMARY KEY NOT NULL,
  "media_type" text NOT NULL,
  "name" text NOT NULL,
  "asset_id" text NOT NULL,
  "asset_url" text NOT NULL,
  "file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "width" integer,
  "height" integer,
  "volume" integer DEFAULT 100 NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);