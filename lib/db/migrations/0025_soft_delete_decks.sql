-- Preserve finished online match references while hiding removed decks.
ALTER TABLE "decks" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
