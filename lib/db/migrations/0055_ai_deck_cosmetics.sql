-- Presentation-only assignments; no inventory grants or changes to battle rules.
BEGIN;
CREATE TABLE IF NOT EXISTS ai_deck_cosmetics (
  deck_id text NOT NULL REFERENCES ai_decks(id) ON DELETE CASCADE,
  cosmetic_id text NOT NULL REFERENCES cosmetic_items(id) ON DELETE CASCADE,
  PRIMARY KEY (deck_id, cosmetic_id)
);
ALTER TABLE ai_deck_cosmetics ENABLE ROW LEVEL SECURITY;
COMMIT;
