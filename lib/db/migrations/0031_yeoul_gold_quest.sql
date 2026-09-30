-- Existing Yeoul and her explicitly requested token; preserve original records.
DO $catalog$
DECLARE target_row record; token_row record;
BEGIN
  IF to_regclass('public.champions') IS NULL OR to_regclass('public.cards') IS NULL THEN RETURN; END IF;
  CREATE TABLE IF NOT EXISTS ko_catalog_patch_backups (
    patch_id text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL,
    original_record jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (patch_id, entity_type, entity_id)
  );
  IF (SELECT count(*) FROM cards WHERE regexp_replace(name,'\s+','','g')='여울의보디가드' AND is_champion_token AND status <> 'DISABLED') <> 1 THEN
    RAISE WARNING 'Yeoul quest not applied: exactly one existing bodyguard token required'; RETURN;
  END IF;
  SELECT * INTO token_row FROM cards WHERE regexp_replace(name,'\s+','','g')='여울의보디가드' AND is_champion_token AND status <> 'DISABLED';
  FOR target_row IN SELECT * FROM champions WHERE regexp_replace(name,'\s+','','g') IN ('여울','챔피언여울') LOOP
    IF EXISTS (SELECT 1 FROM ko_catalog_patch_backups WHERE patch_id='0031-yeoul-gold-v1' AND entity_type='champion' AND entity_id=target_row.id) THEN CONTINUE; END IF;
    INSERT INTO ko_catalog_patch_backups VALUES ('0031-yeoul-gold-v1','champion',target_row.id,to_jsonb(target_row),now());
    IF token_row.status='DRAFT' THEN
      INSERT INTO ko_catalog_patch_backups VALUES ('0031-yeoul-gold-v1','card',token_row.id,to_jsonb(token_row),now()) ON CONFLICT DO NOTHING;
      UPDATE cards SET status='PUBLISHED', version=version+1, updated_at=now() WHERE id=token_row.id AND status='DRAFT';
    END IF;
    UPDATE champions SET has_quest=true, quest_name='골드 30 소모', quest_text='이번 게임에서 골드를 총 30 소모하세요.',
      quest_condition='{"event":"GOLD_CHANGED","goldSpent":true,"required":30}'::jsonb,
      quest_progress_required=30, quest_reward_text='고유 능력이 강화됩니다.',
      quest_reward_effects='{"effects":[{"trigger":"ENTER_FIELD","action":"UPGRADE_CHAMPION_ABILITY"}]}'::jsonb,
      upgraded_ability_name=COALESCE(NULLIF(upgraded_ability_name,''),ability_name || ' (강화)'),
      upgraded_ability_cost=COALESCE(upgraded_ability_cost,ability_cost),
      upgraded_ability_text='다음 턴에 골드를 1 더 받습니다. 그리고 여울의 보디가드를 소환합니다.',
      upgraded_ability_effects=jsonb_build_object('effects',jsonb_build_array(
        jsonb_build_object('trigger','ACTIVE','action','ADD_NEXT_TURN_GOLD','values',jsonb_build_object('amount',1)),
        jsonb_build_object('trigger','ACTIVE','action','SUMMON','values',jsonb_build_object('definitionRef',jsonb_build_object('id',token_row.id),'count',1)))),
      version=version+1, updated_at=now() WHERE id=target_row.id;
  END LOOP;
END
$catalog$;
