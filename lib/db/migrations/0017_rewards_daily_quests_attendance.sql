BEGIN;

CREATE TABLE IF NOT EXISTS "reward_settings" (
  "key" text PRIMARY KEY,
  "reward_type" text NOT NULL DEFAULT 'CURRENCY',
  "amount" integer NOT NULL DEFAULT 0,
  "enabled" boolean NOT NULL DEFAULT false,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "reward_grants" (
  "id" text PRIMARY KEY,
  "idempotency_key" text NOT NULL UNIQUE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "reward_type" text NOT NULL,
  "amount" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "reward_grants_user_source_idx"
  ON "reward_grants" ("user_id", "source_type", "source_id");

CREATE TABLE IF NOT EXISTS "daily_quest_definitions" (
  "id" text PRIMARY KEY,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "objective_type" text NOT NULL,
  "card_type" text,
  "target_value" integer NOT NULL,
  "reward_type" text NOT NULL DEFAULT 'CURRENCY',
  "reward_amount" integer NOT NULL DEFAULT 0,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "daily_quest_assignments" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "definition_id" text NOT NULL REFERENCES "daily_quest_definitions"("id") ON DELETE RESTRICT,
  "assignment_date" text NOT NULL,
  "slot" integer NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "objective_type" text NOT NULL,
  "card_type" text,
  "target_value" integer NOT NULL,
  "reward_type" text NOT NULL,
  "reward_amount" integer NOT NULL,
  "progress" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'ASSIGNED',
  "claimed_at" timestamptz,
  "assigned_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "daily_quest_assignments_user_date_definition_unique"
    UNIQUE ("user_id", "assignment_date", "definition_id"),
  CONSTRAINT "daily_quest_assignments_user_date_slot_unique"
    UNIQUE ("user_id", "assignment_date", "slot")
);
CREATE INDEX IF NOT EXISTS "daily_quest_assignments_user_date_idx"
  ON "daily_quest_assignments" ("user_id", "assignment_date");

CREATE TABLE IF NOT EXISTS "daily_quest_progress_events" (
  "id" text PRIMARY KEY,
  "assignment_id" text NOT NULL REFERENCES "daily_quest_assignments"("id") ON DELETE CASCADE,
  "occurrence_key" text NOT NULL UNIQUE,
  "increment" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "attendance_reward_definitions" (
  "day_index" integer PRIMARY KEY,
  "reward_type" text NOT NULL DEFAULT 'CURRENCY',
  "reward_amount" integer NOT NULL DEFAULT 0,
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "attendance_claims" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "claim_date" text NOT NULL,
  "day_index" integer NOT NULL REFERENCES "attendance_reward_definitions"("day_index") ON DELETE RESTRICT,
  "reward_type" text NOT NULL,
  "reward_amount" integer NOT NULL,
  "claimed_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "attendance_claims_user_date_unique"
    UNIQUE ("user_id", "claim_date"),
  CONSTRAINT "attendance_claims_user_day_unique"
    UNIQUE ("user_id", "day_index")
);

COMMIT;