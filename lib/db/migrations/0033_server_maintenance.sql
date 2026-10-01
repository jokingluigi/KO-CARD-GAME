CREATE TABLE IF NOT EXISTS ko_server_settings (
 id text PRIMARY KEY, maintenance_enabled boolean NOT NULL DEFAULT false,
 maintenance_message text NOT NULL DEFAULT '서버 점검 중입니다. 점검이 끝나면 다시 접속해 주세요.',
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ko_server_settings(id) VALUES ('server') ON CONFLICT DO NOTHING;
