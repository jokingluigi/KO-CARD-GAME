BEGIN;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "champion_prism_balance" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "champion_prism_economy_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "craft_cost" integer NOT NULL,
  "duplicate_reward" integer NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "champion_prism_transactions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "amount" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "champion_definition_id" text REFERENCES "champions"("id") ON DELETE SET NULL,
  "metadata" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "pack_opening_claims" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "pack_definition_id" text NOT NULL REFERENCES "pack_definitions"("id") ON DELETE CASCADE,
  "idempotency_key" text NOT NULL,
  "rewards" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "pack_opening_claims_user_id_idempotency_key_idx"
  ON "pack_opening_claims" ("user_id", "idempotency_key");

COMMIT;