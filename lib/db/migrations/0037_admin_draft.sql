CREATE TABLE IF NOT EXISTS draft_settings (id text PRIMARY KEY DEFAULT 'global', enabled boolean NOT NULL DEFAULT false, config jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO draft_settings (id, enabled) VALUES ('global', false) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS draft_sessions (id text PRIMARY KEY, version integer NOT NULL DEFAULT 0, state jsonb NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS draft_participants (user_id text PRIMARY KEY REFERENCES users(id), session_id text NOT NULL REFERENCES draft_sessions(id));
