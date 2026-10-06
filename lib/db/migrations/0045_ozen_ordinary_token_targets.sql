DO $catalog$
DECLARE target_row record;
BEGIN
  IF to_regclass('public.cards') IS NULL THEN RETURN; END IF;
  SELECT * INTO target_row FROM cards
    WHERE id='dc43dc88-38d7-499b-ad89-6b83f773fe62'
      AND text='등장:상대 필드에 비용이 1 이하인 선수 카드가 있다면 그 카드들 중 무작위 한장을 파괴 시킵니다.(챔피언 등급 제외)'
      AND effect_id='STRUCTURED_EFFECTS_V1'
      AND effect_config #>> '{effects,0,action}'='DESTROY'
      AND effect_config #>> '{effects,0,trigger}'='ENTER_FIELD'
      AND effect_config #>> '{effects,0,target,selection}'='RANDOM'
      AND effect_config #>> '{effects,0,target,filter,maxCost}'='1'
      AND COALESCE(effect_config #>> '{effects,0,target,randomScope}','STANDARD')='STANDARD'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO ko_catalog_patch_backups(patch_id,entity_type,entity_id,original_record)
    VALUES('0045_ozen_ordinary_token_targets','card',target_row.id,to_jsonb(target_row)) ON CONFLICT DO NOTHING;
  UPDATE cards SET effect_config=jsonb_set(effect_config,'{effects,0,target,randomScope}','"FULL"'::jsonb),
    version=version+1,updated_at=now() WHERE id=target_row.id;
END
$catalog$;
