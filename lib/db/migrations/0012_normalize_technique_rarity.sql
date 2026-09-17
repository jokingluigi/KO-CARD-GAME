UPDATE "cards"
SET
  "rarity" = CASE WHEN "is_token" THEN 'TOKEN' ELSE 'NORMAL' END,
  "updated_at" = NOW()
WHERE "card_type" = 'TECHNIQUE'
  AND "rarity" IN ('LEGENDARY', 'CHAMPION');