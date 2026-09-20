-- Canonical card tags. This file is a reviewed Production migration artifact;
-- do not run it directly from application startup or the agent.
BEGIN;

-- Preflight: existing rows receive the empty array through the NOT NULL default.
SELECT COUNT(*) AS cards_before_tags FROM public.cards;

ALTER TABLE public.cards
  ADD COLUMN tags text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE OR REPLACE FUNCTION public.card_tags_are_valid(p_tags text[])
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  tag text;
  seen text[] := ARRAY[]::text[];
BEGIN
  IF cardinality(p_tags) > 3 THEN
    RETURN false;
  END IF;
  FOREACH tag IN ARRAY p_tags LOOP
    IF tag IS NULL OR btrim(tag) = '' OR tag <> btrim(tag) OR tag = ANY(seen) THEN
      RETURN false;
    END IF;
    seen := array_append(seen, tag);
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE public.cards
  ADD CONSTRAINT cards_tags_valid CHECK (public.card_tags_are_valid(tags));

-- Postflight: all migrated rows must have a valid canonical array.
SELECT COUNT(*) AS cards_with_invalid_tags
FROM public.cards
WHERE NOT public.card_tags_are_valid(tags);

COMMIT;