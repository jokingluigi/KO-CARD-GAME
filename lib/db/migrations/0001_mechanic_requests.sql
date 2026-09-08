DO $$ BEGIN
  CREATE TYPE "mechanic_request_status" AS ENUM (
    'PENDING', 'ANALYZING', 'READY_TO_GENERATE', 'GENERATING', 'TESTING',
    'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'FAILED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "mechanic_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "status" "mechanic_request_status" DEFAULT 'PENDING' NOT NULL,
  "original_card_text" text NOT NULL,
  "analysis_result" jsonb NOT NULL,
  "unsupported_parts" text[] NOT NULL,
  "requested_by" text NOT NULL,
  "proposed_effect_name" text,
  "proposed_description" text,
  "affected_systems" text[],
  "generated_patch_summary" text,
  "test_result" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "mechanic_requests_pending_original_card_text_unique"
  ON "mechanic_requests" ("original_card_text")
  WHERE "status" = 'PENDING';