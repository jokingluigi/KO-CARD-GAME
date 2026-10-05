-- Repair the existing published quest to match its eight-generation description.
-- Keep other champions, customized quests and completed matches unchanged.
DO $catalog$
DECLARE target_row record;
BEGIN
  IF to_regclass('public.champions') IS NULL THEN RETURN; END IF;
  CREATE TABLE IF NOT EXISTS ko_catalog_patch_backups (
    patch_id text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL,
    original_record jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (patch_id, entity_type, entity_id)
  );
  SELECT * INTO target_row FROM champions
    WHERE id = '3cbb09c4-f8ac-4668-9378-5c01bfa9474b'
      AND quest_text ~ '선수\s*카드를\s*8번\s*생성'
      AND quest_condition->>'event' = 'CARD_GENERATED'
      AND quest_condition->>'cardType' = 'WRESTLER'
      AND quest_progress_required = 7
      AND quest_condition->>'required' = '7'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO ko_catalog_patch_backups(patch_id, entity_type, entity_id, original_record)
    VALUES ('0042_jaeger_quest_eight_generations', 'champion', target_row.id, to_jsonb(target_row))
    ON CONFLICT DO NOTHING;
  UPDATE champions SET quest_progress_required = 8,
    quest_condition = jsonb_set(quest_condition, '{required}', '8'::jsonb),
    version = version + 1, updated_at = now()
    WHERE id = target_row.id;
END
$catalog$;
