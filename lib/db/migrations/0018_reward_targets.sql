BEGIN;

ALTER TABLE "reward_settings"
  ADD COLUMN IF NOT EXISTS "reward_target_id" text;
ALTER TABLE "reward_grants"
  ADD COLUMN IF NOT EXISTS "reward_target_id" text;
ALTER TABLE "daily_quest_definitions"
  ADD COLUMN IF NOT EXISTS "reward_target_id" text;
ALTER TABLE "daily_quest_assignments"
  ADD COLUMN IF NOT EXISTS "reward_target_id" text;
ALTER TABLE "attendance_reward_definitions"
  ADD COLUMN IF NOT EXISTS "reward_target_id" text;
ALTER TABLE "attendance_claims"
  ADD COLUMN IF NOT EXISTS "reward_target_id" text;

COMMIT;