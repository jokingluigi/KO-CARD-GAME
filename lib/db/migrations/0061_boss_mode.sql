-- 보스전 모드: 보스 정의와 사용자 클리어 기록 (추가만 함, 기존 데이터는 건드리지 않음)
CREATE TABLE IF NOT EXISTS bosses (
  id text PRIMARY KEY,
  name text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  image_url text,
  status text NOT NULL DEFAULT 'DRAFT',
  stage_order integer NOT NULL DEFAULT 1,
  ai_deck_id text,
  first_clear_reward integer NOT NULL DEFAULT 300,
  player_health_bonus integer NOT NULL DEFAULT 0,
  phases jsonb NOT NULL DEFAULT '[]'::jsonb,
  intro_dialogue jsonb NOT NULL DEFAULT '[]'::jsonb,
  clear_dialogue jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS boss_clears (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  boss_id text NOT NULL,
  clear_count integer NOT NULL DEFAULT 1,
  first_cleared_at timestamptz NOT NULL DEFAULT now(),
  last_cleared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, boss_id)
);
ALTER TABLE bosses ENABLE ROW LEVEL SECURITY;
ALTER TABLE boss_clears ENABLE ROW LEVEL SECURITY
