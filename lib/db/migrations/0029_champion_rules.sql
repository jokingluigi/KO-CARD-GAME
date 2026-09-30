-- User-authorized existing catalog edits, backed up once; never creates champions.
DO $catalog$
DECLARE config jsonb; target_row record;
BEGIN
  IF to_regclass('public.champions') IS NULL THEN RETURN; END IF;
  CREATE TABLE IF NOT EXISTS ko_catalog_patch_backups (
    patch_id text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL,
    original_record jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (patch_id, entity_type, entity_id)
  );
  FOR config IN SELECT value FROM jsonb_array_elements('[{"name": "퍼플레인", "ability_text": "내 챔피언 또는 아군 선수 1장에게 1 피해를 줍니다. 챔피언이면 카드 1장을 뽑고 그 카드의 비용을 1 감소시킵니다. 선수이면 공격력 +1을 부여합니다.", "ability_effects": {"effects": [{"trigger": "ACTIVE", "action": "DAMAGE", "target": {"zone": "CHARACTER", "owner": "SELF", "selection": "PLAYER_CHOICE", "count": 1}, "values": {"amount": 1, "purpleRainFollowup": true}}]}, "quest_text": "이번 게임에서 내 카드 또는 챔피언 효과로 내 챔피언 또는 아군 선수가 피해를 총 8회 받으세요. 상대 효과와 전투 피해는 제외합니다.", "quest_condition": {"event": "DAMAGE_DEALT", "selfEffectDamage": true, "required": 8}, "quest_progress_required": 8, "upgraded_ability_text": "내 챔피언 또는 아군 선수 1장에게 2 피해를 줍니다. 챔피언이면 카드 1장을 뽑고 그 카드의 비용을 2 감소시킵니다. 선수이면 공격력 +2을 부여합니다.", "upgraded_ability_effects": {"effects": [{"trigger": "ACTIVE", "action": "DAMAGE", "target": {"zone": "CHARACTER", "owner": "SELF", "selection": "PLAYER_CHOICE", "count": 1}, "values": {"amount": 2, "purpleRainFollowup": true}}]}}, {"name": "라칼라베라", "ability_text": "1코스트 1/1 좀비를 소환합니다.", "ability_effects": {"effects": [{"trigger": "ACTIVE", "action": "SUMMON", "values": {"definitionRef": {"name": "좀비"}, "count": 1, "generatedModifiers": {"attack": 0, "health": 0}}}]}, "quest_text": "이번 게임에서 아군 선수가 총 10회 리타이어하세요. DESTROY는 포함하지 않습니다.", "quest_condition": {"event": "CARD_RETIRED", "cardType": "WRESTLER", "strictEventCount": true, "required": 10}, "quest_progress_required": 10, "upgraded_ability_text": "1코스트 2/2 좀비를 소환합니다.", "upgraded_ability_effects": {"effects": [{"trigger": "ACTIVE", "action": "SUMMON", "values": {"definitionRef": {"name": "좀비"}, "count": 1, "generatedModifiers": {"attack": 1, "health": 1}}}]}}]'::jsonb) LOOP
    FOR target_row IN SELECT * FROM champions WHERE regexp_replace(name, '\s+', '', 'g') IN (config->>'name', '챔피언' || (config->>'name')) LOOP
      IF EXISTS (SELECT 1 FROM ko_catalog_patch_backups WHERE patch_id='0029-champion-rules-v1' AND entity_type='champion' AND entity_id=target_row.id) THEN CONTINUE; END IF;
      INSERT INTO ko_catalog_patch_backups VALUES ('0029-champion-rules-v1','champion',target_row.id,to_jsonb(target_row),now());
      UPDATE champions SET ability_text=config->>'ability_text', ability_effects=config->'ability_effects',
        has_quest=true, quest_name=COALESCE(NULLIF(quest_name,''),config->>'quest_text'),
        quest_text=config->>'quest_text', quest_condition=config->'quest_condition',
        quest_progress_required=(config->>'quest_progress_required')::integer,
        quest_reward_text='고유 능력이 강화됩니다.', quest_reward_effects='{"effects":[{"trigger":"ENTER_FIELD","action":"UPGRADE_CHAMPION_ABILITY"}]}'::jsonb,
        upgraded_ability_name=COALESCE(NULLIF(upgraded_ability_name,''),ability_name || ' (강화)'),
        upgraded_ability_cost=COALESCE(upgraded_ability_cost,ability_cost),
        upgraded_ability_text=config->>'upgraded_ability_text', upgraded_ability_effects=config->'upgraded_ability_effects',
        version=version+1, updated_at=now() WHERE id=target_row.id;
    END LOOP;
  END LOOP;
  IF to_regclass('public.cards') IS NOT NULL THEN
    FOR target_row IN SELECT * FROM cards WHERE trim(name)='좀비' AND is_token=true AND card_type='WRESTLER' LOOP
      IF EXISTS (SELECT 1 FROM ko_catalog_patch_backups WHERE patch_id='0029-champion-rules-v1' AND entity_type='card' AND entity_id=target_row.id) THEN CONTINUE; END IF;
      INSERT INTO ko_catalog_patch_backups VALUES ('0029-champion-rules-v1','card',target_row.id,to_jsonb(target_row),now());
      UPDATE cards SET cost=1, attack=1, health=1,
        text='아군 필드에는 좀비를 1장만 둘 수 있습니다. 이미 아군 좀비가 있다면 새 좀비를 소환하지 않고 소환될 좀비의 능력치만큼 기존 좀비에게 부여합니다. 필드에 있는 동안 다른 아군 또는 상대 선수가 리타이어할 때마다 +1/+1을 얻습니다.',
        keywords=ARRAY[]::text[], effect_id='STRUCTURED_EFFECTS_V1', effect_config='{"effects":[]}'::jsonb,
        version=version+1, updated_at=now() WHERE id=target_row.id;
    END LOOP;
  END IF;
END
$catalog$;
