import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('AI difficulty migration preserves existing decks and saved difficulty when repeated', async () => {
  const pg = new PGlite();
  try {
    await pg.exec("CREATE TABLE ai_decks (id text PRIMARY KEY, name text NOT NULL, card_definition_ids text[] NOT NULL); INSERT INTO ai_decks VALUES ('existing', 'Preserved', ARRAY['a','a','b']);");
    const migration = await readFile(new URL('../migrations/0028_ai_deck_difficulty.sql', import.meta.url), 'utf8');
    await pg.exec(migration);
    assert.deepEqual((await pg.query('SELECT * FROM ai_decks')).rows, [{ id: 'existing', name: 'Preserved', card_definition_ids: ['a','a','b'], difficulty: 'NORMAL' }]);
    await pg.exec("UPDATE ai_decks SET difficulty='BOSS' WHERE id='existing'");
    await pg.exec(migration);
    assert.equal((await pg.query<{ difficulty: string }>('SELECT difficulty FROM ai_decks')).rows[0].difficulty, 'BOSS');
  } finally { await pg.close(); }
});
