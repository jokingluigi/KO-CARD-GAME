-- User-authorized addition to existing Pi Star Seven settings; preserve base ability.
DO $catalog$
DECLARE target_row record;
BEGIN
  IF to_regclass('public.champions') IS NULL THEN RETURN; END IF;
  CREATE TABLE IF NOT EXISTS ko_catalog_patch_backups (
    patch_id text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL,
    original_record jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (patch_id, entity_type, entity_id)
  );
  FOR target_row IN SELECT * FROM champions WHERE regexp_replace(name, '\s+', '', 'g') IN ('피스타세븐','챔피언피스타세븐') LOOP
    IF EXISTS (SELECT 1 FROM ko_catalog_patch_backups WHERE patch_id='0030-pi-star-seven-v1' AND entity_type='champion' AND entity_id=target_row.id) THEN CONTINUE; END IF;
    INSERT INTO ko_catalog_patch_backups VALUES ('0030-pi-star-seven-v1','champion',target_row.id,to_jsonb(target_row),now());
    UPDATE champions SET has_quest=true, quest_name='트레이닝 5회',
      quest_text='이번 게임에서 고유 능력을 5번 발동하세요.',
      quest_condition='{"event":"CHAMPION_ABILITY_USED","sourceActionType":"USE_CHAMPION_ABILITY","strictEventCount":true,"progress":1,"required":5}'::jsonb,
      quest_progress_required=5, quest_reward_text='고유 능력이 강화됩니다.',
      quest_reward_effects='{"effects":[{"trigger":"ENTER_FIELD","action":"UPGRADE_CHAMPION_ABILITY"}]}'::jsonb,
      upgraded_ability_name=COALESCE(NULLIF(upgraded_ability_name,''),ability_name || ' (강화)'),
      upgraded_ability_cost=1,
      upgraded_ability_text='내 손에 있는 무작위 선수 카드 2장에게 +1/+1을 부여합니다.',
      upgraded_ability_effects='{"effects":[{"trigger":"ACTIVE","action":"BUFF","target":{"zone":"HAND","owner":"SELF","cardType":"WRESTLER","selection":"RANDOM","count":2},"values":{"attack":1,"health":1}}]}'::jsonb,
      version=version+1, updated_at=now() WHERE id=target_row.id;
  END LOOP;
END
$catalog$;
