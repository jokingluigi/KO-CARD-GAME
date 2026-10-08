
ALTER TABLE daily_quest_definitions ADD COLUMN IF NOT EXISTS platform jsonb;
ALTER TABLE daily_quest_assignments ADD COLUMN IF NOT EXISTS platform jsonb;
CREATE TABLE IF NOT EXISTS quest_seasons (
 id text PRIMARY KEY, name text NOT NULL, starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'ACTIVE',
 updated_at timestamptz NOT NULL DEFAULT now(), CHECK (ends_at > starts_at)
);
CREATE TABLE IF NOT EXISTS quest_platform_settings (
 id text PRIMARY KEY, daily_count integer NOT NULL DEFAULT 3 CHECK (daily_count BETWEEN 1 AND 20),
 timezone text NOT NULL DEFAULT 'Asia/Seoul', updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO quest_platform_settings(id) VALUES ('default') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS quest_admin_audit (
 id text PRIMARY KEY, admin_id text NOT NULL REFERENCES users(id), action text NOT NULL,
 entity_id text NOT NULL, configuration jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
