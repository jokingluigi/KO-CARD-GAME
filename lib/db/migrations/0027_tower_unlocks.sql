-- Tower-only additive permanent unlocks. Safe to apply repeatedly.
CREATE TABLE IF NOT EXISTS tower_unlocks (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('RELIC', 'STARTER')),
  target_id text NOT NULL,
  source_run_id text NOT NULL REFERENCES tower_runs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tower_permanent_unlock ON tower_unlocks(user_id, kind, target_id);
