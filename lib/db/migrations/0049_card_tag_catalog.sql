CREATE TABLE IF NOT EXISTS card_tags (
  name text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO card_tags (name)
SELECT DISTINCT btrim(tag) FROM cards CROSS JOIN LATERAL unnest(tags) AS tag
WHERE btrim(tag) <> ''
ON CONFLICT (name) DO NOTHING;
