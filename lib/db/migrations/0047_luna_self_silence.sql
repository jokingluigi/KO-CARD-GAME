DO $catalog$
DECLARE target_row record;
BEGIN
  IF to_regclass('public.cards') IS NULL THEN RETURN; END IF;
  SELECT * INTO target_row FROM cards
    WHERE id='9b7c0e52-2184-4ec1-8d68-39a4d5981d2a'
      AND text='이 카드를 처음으로 공격한 적 선수는 공격 이후 침묵됩니다. 이후 이 카드의 능력을 비활성화합니다.'
      AND effect_id='STRUCTURED_EFFECTS_V1'
      AND effect_config #>> '{effects,1,action}'='DISABLE_ABILITY'
      AND effect_config #>> '{effects,1,trigger}'='FIRST_ATTACKED'
      AND effect_config #>> '{effects,1,target,owner}'='SELF'
      AND effect_config #>> '{effects,1,target,selection}'='SELF'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO ko_catalog_patch_backups(patch_id,entity_type,entity_id,original_record)
    VALUES('0047_luna_self_silence','card',target_row.id,to_jsonb(target_row)) ON CONFLICT DO NOTHING;
  UPDATE cards SET effect_config=jsonb_set(effect_config,'{effects,1,action}','"SILENCE"'::jsonb),
    text='이 카드를 처음으로 공격한 적 선수는 공격 이후 침묵됩니다. 이후 이 카드도 침묵됩니다.',
    version=version+1,updated_at=now() WHERE id=target_row.id;
END
$catalog$;
