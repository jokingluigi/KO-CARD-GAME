CREATE TABLE IF NOT EXISTS quest_progress_outbox (
 id text PRIMARY KEY,match_id text NOT NULL,player_one_user_id text NOT NULL,player_two_user_id text NOT NULL,payload jsonb NOT NULL,attempts integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),available_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quest_progress_outbox_due_idx ON quest_progress_outbox(available_at);
CREATE INDEX IF NOT EXISTS quest_progress_outbox_one_idx ON quest_progress_outbox(player_one_user_id);
CREATE INDEX IF NOT EXISTS quest_progress_outbox_two_idx ON quest_progress_outbox(player_two_user_id);
