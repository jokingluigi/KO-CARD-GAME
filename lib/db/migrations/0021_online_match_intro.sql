ALTER TABLE "online_matches" ADD COLUMN IF NOT EXISTS "gameplay_starts_at" timestamptz;
ALTER TABLE "champions" ADD COLUMN IF NOT EXISTS "intro_line_one" text;
ALTER TABLE "champions" ADD COLUMN IF NOT EXISTS "intro_line_two" text;
CREATE TABLE IF NOT EXISTS "champion_intro_interactions" (
  "id" text PRIMARY KEY NOT NULL,
  "champion_one_id" text NOT NULL REFERENCES "champions"("id") ON DELETE CASCADE,
  "champion_two_id" text NOT NULL REFERENCES "champions"("id") ON DELETE CASCADE,
  "line_one" text,
  "line_two" text,
  "first_speaker" text NOT NULL DEFAULT 'ONE',
  "status" text NOT NULL DEFAULT 'DRAFT',
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "champion_intro_interactions_pair_unique"
  ON "champion_intro_interactions" ("champion_one_id", "champion_two_id");
ALTER TABLE "champion_intro_interactions"
  ADD CONSTRAINT "champion_intro_interactions_canonical_pair_check"
  CHECK ("champion_one_id" < "champion_two_id");
ALTER TABLE "champion_intro_interactions"
  ADD CONSTRAINT "champion_intro_interactions_status_check"
  CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'DISABLED'));