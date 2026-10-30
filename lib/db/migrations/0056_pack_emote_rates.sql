-- Schema only. Existing probabilities/inventory are not rewritten.
BEGIN;
ALTER TABLE pack_definitions ADD COLUMN IF NOT EXISTS emote_rate integer NOT NULL DEFAULT 0;
ALTER TABLE pack_definitions ADD COLUMN IF NOT EXISTS emote_pool text[] NOT NULL DEFAULT ARRAY[]::text[];
COMMIT;
