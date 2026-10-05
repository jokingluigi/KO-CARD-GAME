-- Restore the missing executable payload for the current attack-only description.
DO $catalog$
DECLARE target_row record;
BEGIN
  IF to_regclass('public.cards') IS NULL THEN RETURN; END IF;
  CREATE TABLE IF NOT EXISTS ko_catalog_patch_backups (
    patch_id text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL,
    original_record jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (patch_id, entity_type, entity_id)
  );
  SELECT * INTO target_row FROM cards
    WHERE id = '5361339a-fd72-47e2-bbcb-f5a193a64ea3'
      AND text = '등장:자신을 제외한 필드에 나와있는 아군 선수들에게 공격력을 +2 부여합니다.'
      AND effect_id IS NULL AND effect_config = '{}'::jsonb
    FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO ko_catalog_patch_backups(patch_id, entity_type, entity_id, original_record)
    VALUES ('0043_pi_star_attack_only', 'card', target_row.id, to_jsonb(target_row))
    ON CONFLICT DO NOTHING;
  UPDATE cards SET effect_id = 'STRUCTURED_EFFECTS_V1',
    effect_config = '{"effects":[{"trigger":"ENTER_FIELD","action":"BUFF","target":{"zone":"BOARD","owner":"SELF","cardType":"WRESTLER","selection":"ALL","count":4,"filter":{"excludeSource":true}},"values":{"attack":2,"health":0}}]}'::jsonb,
    version = version + 1, updated_at = now()
    WHERE id = target_row.id;
END
$catalog$;
