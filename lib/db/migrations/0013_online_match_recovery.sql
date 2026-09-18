ALTER TABLE "online_matches"
  ADD COLUMN IF NOT EXISTS "turn_started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "turn_deadline_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "player1_disconnect_started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "player1_reconnect_deadline_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "player2_disconnect_started_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "player2_reconnect_deadline_at" timestamptz;