DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'champion_intro_interactions'::regclass
      AND contype = 'f'
  LOOP
    EXECUTE format(
      'ALTER TABLE champion_intro_interactions DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;