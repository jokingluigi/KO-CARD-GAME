-- Additive only. Custom server sessions mediate access. No anon/authenticated direct policies.
CREATE TABLE IF NOT EXISTS cosmetic_items (
 id text PRIMARY KEY, type text NOT NULL, name text NOT NULL, description text NOT NULL DEFAULT '', target_id text,
 image_assets jsonb NOT NULL DEFAULT '{}', is_active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT cosmetic_type CHECK(type IN ('CHAMPION_SKIN','CARD_SKIN','CARD_BACK','IMAGE_EMOTE')),
 CONSTRAINT cosmetic_target CHECK ((type IN ('CHAMPION_SKIN','CARD_SKIN')) = (target_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS cosmetics_catalog_order ON cosmetic_items(is_active,sort_order);
CREATE TABLE IF NOT EXISTS user_cosmetics (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, cosmetic_id text NOT NULL REFERENCES cosmetic_items(id),
 acquired_at timestamptz NOT NULL DEFAULT now(), acquisition_source text NOT NULL DEFAULT 'ADMIN', PRIMARY KEY(user_id,cosmetic_id)
);
CREATE TABLE IF NOT EXISTS user_equipped_cosmetics (
 user_id text NOT NULL, slot text NOT NULL, cosmetic_id text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,slot), CONSTRAINT cosmetic_equipped_once UNIQUE(user_id,cosmetic_id),
 FOREIGN KEY(user_id,cosmetic_id) REFERENCES user_cosmetics(user_id,cosmetic_id) ON DELETE CASCADE,
 CONSTRAINT cosmetic_slot CHECK(slot='back' OR slot ~ '^(champion|card):.+$' OR slot ~ '^emote:[1-4]$')
);
CREATE TABLE IF NOT EXISTS cosmetic_audit (id text PRIMARY KEY,actor_id text NOT NULL,user_id text,cosmetic_id text NOT NULL,action text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE cosmetic_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_equipped_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosmetic_audit ENABLE ROW LEVEL SECURITY;
