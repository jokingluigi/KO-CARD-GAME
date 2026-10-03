-- EPIC is opt-in: existing pack probabilities and catalog rows are preserved.
ALTER TABLE IF EXISTS pack_definitions ADD COLUMN IF NOT EXISTS epic_rate integer NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS pack_definitions ADD COLUMN IF NOT EXISTS epic_card_pool text[] NOT NULL DEFAULT ARRAY[]::text[];
