-- Additive, idempotent. No catalog/account/reward content changes.
CREATE TABLE IF NOT EXISTS usage_collection_failures (source_key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 1, next_retry_at timestamptz NOT NULL, last_failed_at timestamptz NOT NULL DEFAULT now(), last_code text NOT NULL);
CREATE TABLE IF NOT EXISTS usage_collection (
 id text PRIMARY KEY CHECK (id = 'global'), started_at timestamptz NOT NULL DEFAULT now(),
 refreshed_at timestamptz, last_error_at timestamptz, last_pruned_at timestamptz
);
INSERT INTO usage_collection(id) VALUES ('global') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS usage_excluded_accounts (user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, reason text NOT NULL);
CREATE TABLE IF NOT EXISTS usage_processed_sources (source_key text PRIMARY KEY, processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS usage_participations (
 id uuid PRIMARY KEY, source_key text NOT NULL, subject_key uuid NOT NULL,
 champion_id text NOT NULL, started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL,
 day date NOT NULL, outcome text NOT NULL CHECK (outcome IN ('WIN','LOSS','DRAW')),
 deck_known boolean NOT NULL, ability_uses integer NOT NULL CHECK (ability_uses >= 0),
 quest_eligible boolean NOT NULL, quest_completed boolean NOT NULL,
 quest_turn integer CHECK (quest_turn >= 0), UNIQUE(source_key, subject_key)
);
CREATE INDEX IF NOT EXISTS usage_participations_day_idx ON usage_participations(day, subject_key);
CREATE INDEX IF NOT EXISTS usage_participations_champion_day_idx ON usage_participations(champion_id, day, subject_key);
CREATE TABLE IF NOT EXISTS usage_card_matches (
 participation_id uuid NOT NULL REFERENCES usage_participations(id) ON DELETE CASCADE,
 card_id text NOT NULL, deck_copies integer NOT NULL CHECK (deck_copies >= 0),
 plays integer NOT NULL CHECK (plays >= 0), generated integer NOT NULL CHECK (generated >= 0),
 summons integer NOT NULL CHECK (summons >= 0), PRIMARY KEY(participation_id,card_id)
);
CREATE INDEX IF NOT EXISTS usage_card_matches_card_idx ON usage_card_matches(card_id, participation_id);
CREATE TABLE IF NOT EXISTS usage_daily_totals (day date PRIMARY KEY, participations bigint NOT NULL, deck_known bigint NOT NULL);
CREATE TABLE IF NOT EXISTS usage_card_daily (
 day date NOT NULL, card_id text NOT NULL, adoptions bigint NOT NULL, copies bigint NOT NULL,
 plays bigint NOT NULL, played_matches bigint NOT NULL, wins bigint NOT NULL, losses bigint NOT NULL,
 draws bigint NOT NULL, generated bigint NOT NULL, summons bigint NOT NULL, PRIMARY KEY(day,card_id)
);
CREATE INDEX IF NOT EXISTS usage_card_daily_card_day_idx ON usage_card_daily(card_id,day);
CREATE TABLE IF NOT EXISTS usage_champion_daily (
 day date NOT NULL, champion_id text NOT NULL, selections bigint NOT NULL,
 wins bigint NOT NULL, losses bigint NOT NULL, draws bigint NOT NULL, ability_uses bigint NOT NULL,
 ability_matches bigint NOT NULL, quest_eligible bigint NOT NULL, quest_completed bigint NOT NULL,
 quest_turn_sum bigint NOT NULL, quest_turn_samples bigint NOT NULL,
 completed_wins bigint NOT NULL, completed_losses bigint NOT NULL, completed_draws bigint NOT NULL,
 incomplete_wins bigint NOT NULL, incomplete_losses bigint NOT NULL, incomplete_draws bigint NOT NULL,
 PRIMARY KEY(day,champion_id)
);
CREATE INDEX IF NOT EXISTS usage_champion_daily_champion_day_idx ON usage_champion_daily(champion_id,day);
ALTER TABLE ai_quest_matches ADD COLUMN IF NOT EXISTS usage_start jsonb;
ALTER TABLE ai_quest_matches ADD COLUMN IF NOT EXISTS usage_summary jsonb;
ALTER TABLE tower_runs ADD COLUMN IF NOT EXISTS usage_pending jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tower_runs ADD COLUMN IF NOT EXISTS usage_battle_started_at timestamptz;
ALTER TABLE draft_sessions ADD COLUMN IF NOT EXISTS usage_start jsonb;
ALTER TABLE online_matches ADD COLUMN IF NOT EXISTS usage_recorded_at timestamptz;
ALTER TABLE ai_quest_matches ADD COLUMN IF NOT EXISTS usage_recorded_at timestamptz;
ALTER TABLE draft_sessions ADD COLUMN IF NOT EXISTS usage_recorded_at timestamptz;
CREATE INDEX IF NOT EXISTS online_matches_usage_ended_idx ON online_matches(ended_at) WHERE status = 'ENDED' AND usage_recorded_at IS NULL AND serialized_snapshot->'usageStart' IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_quest_matches_usage_idx ON ai_quest_matches(created_at) WHERE usage_summary IS NOT NULL AND usage_recorded_at IS NULL;
CREATE INDEX IF NOT EXISTS tower_runs_usage_pending_idx ON tower_runs(updated_at) WHERE usage_pending <> '[]'::jsonb;
CREATE INDEX IF NOT EXISTS draft_sessions_usage_idx ON draft_sessions(updated_at) WHERE usage_start IS NOT NULL AND usage_recorded_at IS NULL;
-- API role only. Supabase anon/authenticated roles receive no direct table access.
ALTER TABLE usage_collection ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_processed_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_card_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_daily_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_card_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_champion_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_excluded_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_collection_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_sessions ADD COLUMN IF NOT EXISTS usage_diagnostic boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS usage_card_users_daily (day date NOT NULL, card_id text NOT NULL, subject_key uuid NOT NULL, PRIMARY KEY(card_id,day,subject_key));
CREATE INDEX IF NOT EXISTS usage_card_users_daily_day_idx ON usage_card_users_daily(day,card_id,subject_key);
CREATE TABLE IF NOT EXISTS usage_champion_users_daily (day date NOT NULL, champion_id text NOT NULL, subject_key uuid NOT NULL, PRIMARY KEY(champion_id,day,subject_key));
CREATE INDEX IF NOT EXISTS usage_champion_users_daily_day_idx ON usage_champion_users_daily(day,champion_id,subject_key);
ALTER TABLE usage_card_users_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_champion_users_daily ENABLE ROW LEVEL SECURITY;

-- These game records are served only by the authenticated API (the migration/table owner).
-- Record previous RLS state for an explicit rollback, without changing account roles or policies.
CREATE TABLE IF NOT EXISTS usage_source_rls_baseline (table_name text PRIMARY KEY, was_enabled boolean NOT NULL);
INSERT INTO usage_source_rls_baseline(table_name,was_enabled)
 SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('online_matches','ai_quest_matches','tower_runs','draft_sessions')
 ON CONFLICT DO NOTHING;
ALTER TABLE usage_source_rls_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quest_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tower_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_sessions ENABLE ROW LEVEL SECURITY;
