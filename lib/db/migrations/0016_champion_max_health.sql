-- Champion maximum health is data, not a fixed engine constant.
-- This migration is a deployment artifact; do not run it from application startup.
BEGIN;

ALTER TABLE public.champions
  ADD COLUMN IF NOT EXISTS max_health integer;

UPDATE public.champions
SET max_health = 20
WHERE max_health IS NULL;

ALTER TABLE public.champions
  ALTER COLUMN max_health SET DEFAULT 20,
  ALTER COLUMN max_health SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'champions_max_health_positive'
  ) THEN
    ALTER TABLE public.champions
      ADD CONSTRAINT champions_max_health_positive CHECK (max_health >= 1);
  END IF;
END $$;

COMMIT;