BEGIN;

ALTER TABLE "daily_quest_definitions"
  ADD COLUMN IF NOT EXISTS "schema_version" text NOT NULL DEFAULT 'QUEST_CONDITION_V1',
  ADD COLUMN IF NOT EXISTS "condition" jsonb;

ALTER TABLE "daily_quest_assignments"
  ADD COLUMN IF NOT EXISTS "schema_version" text NOT NULL DEFAULT 'QUEST_CONDITION_V1',
  ADD COLUMN IF NOT EXISTS "condition" jsonb;

COMMIT;