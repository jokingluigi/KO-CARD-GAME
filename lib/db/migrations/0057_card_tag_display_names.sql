-- Stable tag keys retain every existing effect reference when an administrator renames a label.
ALTER TABLE card_tags ADD COLUMN IF NOT EXISTS display_name text;
