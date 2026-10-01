DO $minion$
BEGIN
 IF to_regclass('public.champions') IS NULL THEN RETURN; END IF;
-- Add only the requested champion; never update existing champion/card rows.
INSERT INTO champions (id,name,description,max_health,ability_name,ability_cost,ability_text,ability_effects,has_quest,status,is_starter_grant)
VALUES ('champion-minion-a','챔피언 미니언 A','예능용 랜덤 챔피언',20,'완전히 무작위',2,
'완전히 무작위 카드 1장을 내 손에 생성합니다.',
'{"effects":[{"trigger":"ACTIVE","action":"GENERATE","target":{"zone":"HAND","owner":"SELF","selection":"RANDOM","count":1,"randomScope":"FULL"}}]}'::jsonb,
false,'PUBLISHED',true)
ON CONFLICT (id) DO NOTHING;
END
$minion$;
