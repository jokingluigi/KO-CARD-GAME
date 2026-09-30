DO $catalog$
DECLARE target_row record; target_config jsonb;
BEGIN
  IF to_regclass('public.cards') IS NULL THEN RETURN; END IF;
  CREATE TABLE IF NOT EXISTS ko_catalog_patch_backups (
    patch_id text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL,
    original_record jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (patch_id,entity_type,entity_id)
  );
  FOR target_row IN SELECT * FROM cards WHERE card_type='WRESTLER' AND regexp_replace(name,'\s+','','g') IN ('오젠','도금구슬마스터') LOOP
    IF EXISTS (SELECT 1 FROM ko_catalog_patch_backups WHERE patch_id='0032-ozen-gilded-v1' AND entity_type='card' AND entity_id=target_row.id) THEN CONTINUE; END IF;
    IF regexp_replace(target_row.name,'\s+','','g')='오젠' THEN
      target_config='{"effects":[{"trigger":"ENTER_FIELD","action":"RETIRE","target":{"zone":"BOARD","owner":"ENEMY","cardType":"WRESTLER","filter":{"maxCost":1,"isChampionToken":false,"excludeChampionRarity":true},"selection":"RANDOM","count":1}}]}'::jsonb;
    ELSE
      target_config=jsonb_build_object('effects',jsonb_build_array(jsonb_build_object('trigger','ENTER_FIELD','action','REDUCE_COST',
        'target',jsonb_build_object('zones',CASE WHEN target_row.text LIKE '%덱%' THEN '["HAND","DECK"]'::jsonb ELSE '["HAND"]'::jsonb END,'owner','SELF','filter',jsonb_build_object('minCost',6),'selection','ALL','count',1),
        'values',jsonb_build_object('amount',1))));
    END IF;
    INSERT INTO ko_catalog_patch_backups VALUES ('0032-ozen-gilded-v1','card',target_row.id,to_jsonb(target_row),now());
    UPDATE cards SET effect_id='STRUCTURED_EFFECTS_V1',effect_config=target_config,version=version+1,updated_at=now() WHERE id=target_row.id;
  END LOOP;
END
$catalog$;
