DO $vanilla$
BEGIN
 IF to_regclass('public.champions') IS NULL THEN RETURN; END IF;
 INSERT INTO champions (id,name,description,max_health,ability_name,ability_cost,ability_text,ability_effects,has_quest,status,is_starter_grant)
 VALUES ('champion-tower-vanilla','타워 일반 상대','타워 일반 층 전용 · 초상화 설정 가능 · 효과 없음 · 체력 30',30,'능력 없음',0,'','{"effects":[]}'::jsonb,false,'DRAFT',false)
 ON CONFLICT (id) DO NOTHING;
END
$vanilla$;
