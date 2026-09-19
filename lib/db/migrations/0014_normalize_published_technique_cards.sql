-- Production data migration for the two published cards that were previously
-- stored as WRESTLER definitions.
--
-- This file is intentionally not executed automatically by the application.
-- Review the preflight SELECT, then run it against the Production Supabase
-- database when the target has been confirmed.
--
-- Affected stable card IDs only:
--   오심정정: 814781f3-2173-411a-a3f3-65042fbea140
--   저지먼트: 88e8f386-4090-4cb5-b6ae-7b0ceb1795aa
--
-- Changed columns:
--   card_type: WRESTLER -> TECHNIQUE
--   effect_config.effects[0].trigger: ENTER_FIELD -> ACTIVE
--   version: incremented only when a row changes
--   updated_at: refreshed only when a row changes
--
-- attack, health, effect_id, image fields, audio fields, ownership data, and
-- every other card column are intentionally left unchanged.

BEGIN;

-- Preflight: save or inspect this result before applying the update.
SELECT
  id,
  name,
  card_type,
  attack,
  health,
  effect_id,
  effect_config,
  version,
  updated_at
FROM public.cards
WHERE id IN (
  '814781f3-2173-411a-a3f3-65042fbea140',
  '88e8f386-4090-4cb5-b6ae-7b0ceb1795aa'
)
ORDER BY id;

-- The action and target-shape guards make this fail closed if either
-- production row does not match the reviewed helium definitions.
UPDATE public.cards
SET
  card_type = 'TECHNIQUE',
  effect_config = jsonb_set(
    effect_config,
    '{effects,0,trigger}',
    '"ACTIVE"'::jsonb
  ),
  version = version + 1,
  updated_at = NOW()
WHERE id IN (
  '814781f3-2173-411a-a3f3-65042fbea140',
  '88e8f386-4090-4cb5-b6ae-7b0ceb1795aa'
)
  AND attack = 0
  AND health = 0
  AND effect_id = 'STRUCTURED_EFFECTS_V1'
  AND jsonb_typeof(effect_config->'effects') = 'array'
  AND jsonb_array_length(effect_config->'effects') = 1
  AND effect_config->'effects'->0->>'trigger' IN ('ENTER_FIELD', 'ACTIVE')
  AND (
    (
      id = '814781f3-2173-411a-a3f3-65042fbea140'
      AND effect_config->'effects'->0->>'action' = 'MOVE_TO_HAND'
      AND effect_config->'effects'->0->'target'->>'zone' = 'GRAVEYARD'
      AND effect_config->'effects'->0->'target'->>'owner' = 'SELF'
      AND effect_config->'effects'->0->'target'->>'cardType' = 'WRESTLER'
      AND effect_config->'effects'->0->'target'->>'selection' = 'PLAYER_CHOICE'
    )
    OR
    (
      id = '88e8f386-4090-4cb5-b6ae-7b0ceb1795aa'
      AND effect_config->'effects'->0->>'action' = 'RETIRE'
      AND effect_config->'effects'->0->'target'->>'zone' = 'BOARD'
      AND effect_config->'effects'->0->'target'->>'owner' = 'ENEMY'
      AND effect_config->'effects'->0->'target'->>'cardType' = 'WRESTLER'
      AND effect_config->'effects'->0->'target'->>'selection' = 'PLAYER_CHOICE'
    )
  )
  AND (
    card_type IS DISTINCT FROM 'TECHNIQUE'
    OR effect_config->'effects'->0->>'trigger' IS DISTINCT FROM 'ACTIVE'
  );

-- Postflight: rerun this SELECT after the update and review the result.
SELECT
  id,
  name,
  card_type,
  attack,
  health,
  effect_id,
  effect_config,
  version,
  updated_at
FROM public.cards
WHERE id IN (
  '814781f3-2173-411a-a3f3-65042fbea140',
  '88e8f386-4090-4cb5-b6ae-7b0ceb1795aa'
)
ORDER BY id;

COMMIT;