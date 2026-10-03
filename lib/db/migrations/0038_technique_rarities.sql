-- Requested technique-only policy: EPIC for ordinary techniques, TOKEN for tokens.
-- Preserve IDs, publication status, effects, ownership, decks, and wrestler grades.
UPDATE cards
SET rarity = CASE WHEN is_token OR is_champion_token OR rarity = 'TOKEN' THEN 'TOKEN' ELSE 'EPIC' END
WHERE card_type = 'TECHNIQUE'
  AND rarity IS DISTINCT FROM CASE WHEN is_token OR is_champion_token OR rarity = 'TOKEN' THEN 'TOKEN' ELSE 'EPIC' END;
