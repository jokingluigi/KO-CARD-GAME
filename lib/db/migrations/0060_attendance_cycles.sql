-- Preserve every historical claim; the original ladder is cycle 1.
ALTER TABLE attendance_claims ADD COLUMN IF NOT EXISTS cycle integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_claims_user_cycle_day_idx ON attendance_claims (user_id, cycle, day_index);
ALTER TABLE attendance_claims DROP CONSTRAINT IF EXISTS attendance_claims_user_day_unique;
DROP INDEX IF EXISTS attendance_claims_user_day_idx;
