import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../migrations/0042_jaeger_quest_eight_generations.sql', import.meta.url), 'utf8');
const id = '3cbb09c4-f8ac-4668-9378-5c01bfa9474b';

test('Jaeger repair preserves all other fields, backs up the original and applies once', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE champions(id text PRIMARY KEY, quest_text text, quest_condition jsonb,
      quest_progress_required integer, version integer, updated_at timestamptz, max_health integer, ability_cost integer);
      INSERT INTO champions VALUES('${id}', '선수 카드를 8번 생성한다.(손패,덱,필드)',
        '{"event":"CARD_GENERATED","cardType":"WRESTLER","progress":1,"required":7}', 7, 4, now(), 30, 2),
        ('other', '선수 카드를 8번 생성한다.', '{"event":"CARD_GENERATED","cardType":"WRESTLER","required":7}', 7, 9, now(), 20, 3);`);
    const before = (await db.query<any>('SELECT * FROM champions ORDER BY id')).rows;
    await db.exec(migration);
    const after = (await db.query<any>('SELECT * FROM champions ORDER BY id')).rows;
    const corrected = after.find(row => row.id === id);
    const original = before.find(row => row.id === id);
    assert.equal(corrected.quest_progress_required, 8);
    assert.deepEqual(corrected.quest_condition, { ...original.quest_condition, required: 8 });
    assert.equal(corrected.version, original.version + 1);
    assert.deepEqual({ ...corrected, quest_progress_required: 7, quest_condition: original.quest_condition,
      version: original.version, updated_at: original.updated_at }, original);
    assert.deepEqual(after.find(row => row.id === 'other'), before.find(row => row.id === 'other'));
    const backup = (await db.query<any>('SELECT original_record FROM ko_catalog_patch_backups')).rows;
    assert.equal(backup.length, 1);
    assert.equal(backup[0].original_record.quest_progress_required, 7);
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT * FROM champions ORDER BY id')).rows, after);
  } finally { await db.close(); }
});

test('Jaeger repair skips absent catalogs and customized seven-generation descriptions', async () => {
  const db = new PGlite();
  try {
    await db.exec(migration);
    await db.exec(`CREATE TABLE champions(id text PRIMARY KEY, quest_text text, quest_condition jsonb,
      quest_progress_required integer, version integer, updated_at timestamptz);
      INSERT INTO champions VALUES('${id}', '선수 카드를 7번 생성한다.',
        '{"event":"CARD_GENERATED","cardType":"WRESTLER","required":7}', 7, 3, now());`);
    const before = (await db.query('SELECT * FROM champions')).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT * FROM champions')).rows, before);
  } finally { await db.close(); }
});
