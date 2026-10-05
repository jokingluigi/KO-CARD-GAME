-- Apply only matching reviewed effect payloads; preserve all base stats and text.
DO $catalog$
DECLARE target_row record;
BEGIN
CREATE TABLE IF NOT EXISTS ko_catalog_patch_backups (patch_id text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL, original_record jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(patch_id,entity_type,entity_id));
IF to_regclass('public.cards') IS NOT NULL THEN
SELECT * INTO target_row FROM cards WHERE id='dc43dc88-38d7-499b-ad89-6b83f773fe62' AND text='등장:상대 필드에 비용이 1 이하인 선수 카드가 있다면 그 카드들 중 무작위 한장을 파괴 시킵니다.(챔피언 등급 제외)' AND effect_id IS NOT DISTINCT FROM NULL AND effect_config='{}'::jsonb FOR UPDATE;
IF FOUND THEN
INSERT INTO ko_catalog_patch_backups(patch_id,entity_type,entity_id,original_record) VALUES ('0044_card_text_audit','card',target_row.id,to_jsonb(target_row)) ON CONFLICT DO NOTHING;
UPDATE cards SET effect_id='STRUCTURED_EFFECTS_V1', effect_config='{"effects":[{"trigger":"ENTER_FIELD","action":"DESTROY","target":{"zone":"BOARD","owner":"ENEMY","cardType":"WRESTLER","filter":{"maxCost":1,"isChampionToken":false,"excludeChampionRarity":true},"selection":"RANDOM","count":1}}]}'::jsonb, version=version+1,updated_at=now() WHERE id=target_row.id;
END IF;
END IF;
IF to_regclass('public.cards') IS NOT NULL THEN
SELECT * INTO target_row FROM cards WHERE id='75863228-ae51-48cb-afec-43cc391672a8' AND text='등장:묘지에 있는 카드 한장을 파괴하고 ''좀비''를 하나 소환합니다.' AND effect_id IS NOT DISTINCT FROM NULL AND effect_config='{}'::jsonb FOR UPDATE;
IF FOUND THEN
INSERT INTO ko_catalog_patch_backups(patch_id,entity_type,entity_id,original_record) VALUES ('0044_card_text_audit','card',target_row.id,to_jsonb(target_row)) ON CONFLICT DO NOTHING;
UPDATE cards SET effect_id='STRUCTURED_EFFECTS_V1', effect_config='{"effects":[{"trigger":"ENTER_FIELD","action":"DESTROY","target":{"zone":"GRAVEYARD","owner":"SELF","selection":"RANDOM","count":1}},{"trigger":"ENTER_FIELD","action":"SUMMON","values":{"definitionRef":{"name":"좀비"},"count":1}}]}'::jsonb, version=version+1,updated_at=now() WHERE id=target_row.id;
END IF;
END IF;
IF to_regclass('public.cards') IS NOT NULL THEN
SELECT * INTO target_row FROM cards WHERE id='8a09fec1-16d8-452b-85c3-a38c7a3a03f6' AND text='등장:내 덱 맨 위에 있는 카드를 파괴하고, 비용/체력/공격을 1씩 깎은 무작위 카드를 덱 맨 위에 추가합니다.(챔피언 토큰 제외)(비용/체력/공격 수치는 최소 1)' AND effect_id IS NOT DISTINCT FROM 'STRUCTURED_EFFECTS_V1' AND effect_config='{"effects":[{"action":"MILL","target":{"zone":"DECK","count":1,"owner":"SELF","selection":"TOP"},"trigger":"ENTER_FIELD"},{"action":"GENERATE","target":{"count":1,"owner":"SELF","zones":["DECK"],"filter":{"isChampionToken":false},"cardType":"WRESTLER","selection":"RANDOM","randomScope":"FULL"},"values":{"destination":"DECK","deckPosition":"TOP","generatedModifiers":{"cost":-1,"attack":-1,"health":-1}},"trigger":"ENTER_FIELD"}]}'::jsonb FOR UPDATE;
IF FOUND THEN
INSERT INTO ko_catalog_patch_backups(patch_id,entity_type,entity_id,original_record) VALUES ('0044_card_text_audit','card',target_row.id,to_jsonb(target_row)) ON CONFLICT DO NOTHING;
UPDATE cards SET effect_id='STRUCTURED_EFFECTS_V1', effect_config='{"effects":[{"action":"MILL","target":{"zone":"DECK","count":1,"owner":"SELF","selection":"TOP"},"trigger":"ENTER_FIELD"},{"action":"GENERATE","target":{"count":1,"owner":"SELF","zones":["DECK"],"filter":{"isChampionToken":false},"selection":"RANDOM","randomScope":"FULL"},"values":{"destination":"DECK","deckPosition":"TOP","generatedModifiers":{"cost":-1,"attack":-1,"health":-1}},"trigger":"ENTER_FIELD"}]}'::jsonb, version=version+1,updated_at=now() WHERE id=target_row.id;
END IF;
END IF;
IF to_regclass('public.cards') IS NOT NULL THEN
SELECT * INTO target_row FROM cards WHERE id='epic-spell-life-exchange' AND text='아군 선수 1장과 상대 선수 1장을 선택하여 현재 HP를 서로 교환합니다. 기존 최대 HP 상한을 적용하며, 두 선수 모두 기절합니다.' AND effect_id IS NOT DISTINCT FROM 'SCRIPT_V1' AND effect_config='{"scripts":[{"steps":[{"id":"ally","type":"SELECT","target":{"zone":"BOARD","count":1,"owner":"SELF","cardType":"WRESTLER","selection":"PLAYER_CHOICE"}},{"id":"enemy","type":"SELECT","target":{"zone":"BOARD","count":1,"owner":"ENEMY","cardType":"WRESTLER","selection":"PLAYER_CHOICE"}},{"id":"allyStat","stat":"HEALTH","type":"AGGREGATE","operation":"SUM","selectionId":"ally"},{"id":"enemyStat","stat":"HEALTH","type":"AGGREGATE","operation":"SUM","selectionId":"enemy"},{"type":"EFFECT","effect":{"action":"SET_STAT","target":{"zone":"BOARD","count":1,"owner":"SELF","cardType":"WRESTLER","resultId":"ally","selection":"ALL"},"values":{"stat":"HEALTH","amountExpression":{"kind":"RESULT_VALUE","resultId":"enemyStat"},"currentHealthOnly":true}}},{"type":"EFFECT","effect":{"action":"SET_STAT","target":{"zone":"BOARD","count":1,"owner":"ENEMY","cardType":"WRESTLER","resultId":"enemy","selection":"ALL"},"values":{"stat":"HEALTH","amountExpression":{"kind":"RESULT_VALUE","resultId":"allyStat"},"currentHealthOnly":true}}},{"type":"EFFECT","effect":{"action":"STUN","target":{"zone":"BOARD","count":1,"owner":"SELF","cardType":"WRESTLER","resultId":"ally","selection":"ALL"}}},{"type":"EFFECT","effect":{"action":"STUN","target":{"zone":"BOARD","count":1,"owner":"ENEMY","cardType":"WRESTLER","resultId":"enemy","selection":"ALL"}}}],"trigger":"ACTIVE","version":"SCRIPT_V1"}]}'::jsonb FOR UPDATE;
IF FOUND THEN
INSERT INTO ko_catalog_patch_backups(patch_id,entity_type,entity_id,original_record) VALUES ('0044_card_text_audit','card',target_row.id,to_jsonb(target_row)) ON CONFLICT DO NOTHING;
UPDATE cards SET effect_id='SCRIPT_V1', effect_config='{"scripts":[{"steps":[{"id":"ally","type":"SELECT","target":{"zone":"BOARD","count":1,"owner":"SELF","cardType":"WRESTLER","selection":"PLAYER_CHOICE"}},{"id":"enemy","type":"SELECT","target":{"zone":"BOARD","count":1,"owner":"ENEMY","cardType":"WRESTLER","selection":"PLAYER_CHOICE"}},{"id":"allyStat","stat":"HEALTH","type":"AGGREGATE","operation":"SUM","selectionId":"ally"},{"id":"enemyStat","stat":"HEALTH","type":"AGGREGATE","operation":"SUM","selectionId":"enemy"},{"type":"AGGREGATE","id":"allyMax","selectionId":"ally","operation":"SUM","stat":"MAX_HEALTH"},{"type":"AGGREGATE","id":"enemyMax","selectionId":"enemy","operation":"SUM","stat":"MAX_HEALTH"},{"type":"EFFECT","effect":{"action":"SET_STAT","target":{"zone":"BOARD","count":1,"owner":"SELF","cardType":"WRESTLER","resultId":"ally","selection":"ALL"},"values":{"stat":"HEALTH","amountExpression":{"kind":"RESULT_VALUE","resultId":"enemyStat"},"currentHealthOnly":false,"maxHealthExpression":{"kind":"RESULT_VALUE","resultId":"enemyMax"}}}},{"type":"EFFECT","effect":{"action":"SET_STAT","target":{"zone":"BOARD","count":1,"owner":"ENEMY","cardType":"WRESTLER","resultId":"enemy","selection":"ALL"},"values":{"stat":"HEALTH","amountExpression":{"kind":"RESULT_VALUE","resultId":"allyStat"},"currentHealthOnly":false,"maxHealthExpression":{"kind":"RESULT_VALUE","resultId":"allyMax"}}}},{"type":"EFFECT","effect":{"action":"STUN","target":{"zone":"BOARD","count":1,"owner":"SELF","cardType":"WRESTLER","resultId":"ally","selection":"ALL"}}},{"type":"EFFECT","effect":{"action":"STUN","target":{"zone":"BOARD","count":1,"owner":"ENEMY","cardType":"WRESTLER","resultId":"enemy","selection":"ALL"}}}],"trigger":"ACTIVE","version":"SCRIPT_V1"}]}'::jsonb, version=version+1,updated_at=now() WHERE id=target_row.id;
END IF;
END IF;
IF to_regclass('public.champions') IS NOT NULL THEN
SELECT * INTO target_row FROM champions WHERE id='champion-minion-a' AND ability_text='완전히 무작위 카드 비용을 1 감소시켜서 1장을 내 손에 생성합니다.' AND ability_effects='{"effects":[{"action":"GENERATE","target":{"zone":"HAND","count":1,"owner":"SELF","selection":"RANDOM","randomScope":"FULL"},"trigger":"ACTIVE"}]}'::jsonb FOR UPDATE;
IF FOUND THEN
INSERT INTO ko_catalog_patch_backups(patch_id,entity_type,entity_id,original_record) VALUES ('0044_card_text_audit','champion',target_row.id,to_jsonb(target_row)) ON CONFLICT DO NOTHING;
UPDATE champions SET ability_effects='{"effects":[{"action":"GENERATE","target":{"zone":"HAND","count":1,"owner":"SELF","selection":"RANDOM","randomScope":"FULL"},"trigger":"ACTIVE","values":{"generatedModifiers":{"cost":-1}}}]}'::jsonb,version=version+1,updated_at=now() WHERE id=target_row.id;
END IF;
END IF;
END
$catalog$;
