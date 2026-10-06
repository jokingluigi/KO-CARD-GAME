DO $catalog$
DECLARE target_row record;
BEGIN
  IF to_regclass('public.cards') IS NULL THEN RETURN; END IF;
  SELECT * INTO target_row FROM cards
    WHERE id='epic-spell-life-exchange'
      AND text='아군 선수 1장과 상대 선수 1장을 선택하여 현재 HP를 서로 교환합니다. 기존 최대 HP 상한을 적용하며, 두 선수 모두 기절합니다.'
      AND effect_id='SCRIPT_V1'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(effect_config->'scripts')='array' THEN effect_config->'scripts' ELSE '[]'::jsonb END) script
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(script->'steps')='array' THEN script->'steps' ELSE '[]'::jsonb END) step WHERE step->>'type'='AGGREGATE' AND step->>'id'='allyMax' AND step->>'stat'='MAX_HEALTH')
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(script->'steps')='array' THEN script->'steps' ELSE '[]'::jsonb END) step WHERE step->>'type'='AGGREGATE' AND step->>'id'='enemyMax' AND step->>'stat'='MAX_HEALTH')
      )
    FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO ko_catalog_patch_backups(patch_id,entity_type,entity_id,original_record)
    VALUES('0046_life_exchange_rules_text','card',target_row.id,to_jsonb(target_row)) ON CONFLICT DO NOTHING;
  UPDATE cards SET text='아군 선수 1장과 상대 선수 1장을 선택하여 현재 체력과 최대 체력을 각각 서로 교환합니다. 두 선수 모두 기절합니다.',
    version=version+1,updated_at=now() WHERE id=target_row.id;
END
$catalog$;
