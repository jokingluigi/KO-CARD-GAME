-- Additive Tower storage. Existing account/game tables and rows are untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS tower_settings (
  id text PRIMARY KEY DEFAULT 'global', enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(), CHECK (id = 'global')
);
INSERT INTO tower_settings (id, enabled) VALUES ('global', false) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tower_seasons (
  id text PRIMARY KEY, name text NOT NULL, active boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tower_one_active_season ON tower_seasons(active) WHERE active = true;
CREATE TABLE IF NOT EXISTS tower_starters (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tower_presets (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tower_relics (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tower_characters (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tower_scenes (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tower_metadata (id text PRIMARY KEY, kind text NOT NULL, data jsonb NOT NULL, CHECK (kind IN ('CARD', 'CHAMPION')));
CREATE TABLE IF NOT EXISTS tower_runs (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), season_id text NOT NULL REFERENCES tower_seasons(id),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0), is_test boolean NOT NULL DEFAULT false, ended boolean NOT NULL DEFAULT false,
  state jsonb NOT NULL, snapshot jsonb NOT NULL, initial_battle jsonb, current_battle jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tower_one_live_run_per_user ON tower_runs(user_id) WHERE ended = false AND is_test = false;
CREATE INDEX IF NOT EXISTS tower_run_user_history ON tower_runs(user_id, created_at);
CREATE TABLE IF NOT EXISTS tower_boss_clears (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), season_id text NOT NULL REFERENCES tower_seasons(id),
  boss_slot_id text NOT NULL CHECK (boss_slot_id IN ('boss1', 'boss2', 'boss3', 'finalBoss', 'hiddenBoss')),
  first_run_id text NOT NULL REFERENCES tower_runs(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tower_first_boss_clear ON tower_boss_clears(user_id, season_id, boss_slot_id);
CREATE TABLE IF NOT EXISTS tower_boss_receipts (
  id text PRIMARY KEY, run_id text NOT NULL REFERENCES tower_runs(id), boss_slot_id text NOT NULL,
  first_clear boolean NOT NULL, reward jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tower_one_reward_per_run_boss ON tower_boss_receipts(run_id, boss_slot_id);
COMMIT;
