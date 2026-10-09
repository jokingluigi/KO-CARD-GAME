CREATE TABLE IF NOT EXISTS tower_versions (
 id text PRIMARY KEY,
 tower_id text NOT NULL REFERENCES tower_seasons(id),
 version integer NOT NULL CHECK (version > 0),
 snapshot jsonb NOT NULL,
 published_by text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tower_version_unique ON tower_versions(tower_id, version);
