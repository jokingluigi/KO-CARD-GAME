-- Additive catalog and permanent purchase receipts. No content seeds or account updates.
CREATE TABLE IF NOT EXISTS shop_decks (
 id text PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '', image_url text,
 card_definition_ids text[] NOT NULL DEFAULT ARRAY[]::text[], price integer NOT NULL CHECK(price >= 0),
 recommended_champion_id text, include_champion boolean NOT NULL DEFAULT false,
 allow_unpublished boolean NOT NULL DEFAULT false, enabled boolean NOT NULL DEFAULT false,
 display_order integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT shop_decks_champion CHECK(NOT include_champion OR recommended_champion_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS shop_decks_listing_idx ON shop_decks(enabled,display_order);
CREATE TABLE IF NOT EXISTS shop_deck_purchases (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 product_id text NOT NULL REFERENCES shop_decks(id), deck_id text NOT NULL,
 price integer NOT NULL CHECK(price >= 0), receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shop_deck_purchase_once ON shop_deck_purchases(user_id,product_id);
ALTER TABLE shop_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_deck_purchases ENABLE ROW LEVEL SECURITY;
