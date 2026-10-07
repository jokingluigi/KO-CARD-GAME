CREATE TABLE IF NOT EXISTS ai_quest_matches (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 deck_id text NOT NULL, ai_deck_id text NOT NULL, difficulty text NOT NULL,
 initial_state jsonb NOT NULL, quest_date text NOT NULL, processed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_quest_matches_user_idx ON ai_quest_matches(user_id);
