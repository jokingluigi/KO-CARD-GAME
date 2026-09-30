import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
const require = createRequire(new URL('../../../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
const output = new URL('../../../artifacts/api-server/dist/startup-schema-qa.mjs', import.meta.url);
await build({ entryPoints: [new URL('../../../artifacts/api-server/src/lib/startup-schema.ts', import.meta.url).pathname], outfile: output.pathname, bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: { '.sql': 'text' } });
const { ensureTowerStorage } = await import(output.href);
const { pool } = await import('../src/index');

test('built startup installer atomically adds Tower and AI difficulty, preserves existing data and flags on restart', async () => {
 const pg = new PGlite();
 try {
  await pg.exec("CREATE TABLE users (id text PRIMARY KEY); INSERT INTO users VALUES ('preserved'); CREATE TABLE ai_decks (id text PRIMARY KEY, name text); INSERT INTO ai_decks VALUES ('saved', 'Existing deck');");
  await ensureTowerStorage(drizzle(pg));
  assert.equal((await pg.query<{ enabled: boolean }>('SELECT enabled FROM tower_settings')).rows[0].enabled, false);
  assert.equal((await pg.query<{ difficulty: string }>('SELECT difficulty FROM ai_decks')).rows[0].difficulty, 'NORMAL');
  await pg.exec("UPDATE ai_decks SET difficulty='BOSS'; UPDATE tower_settings SET enabled=true;");
  await ensureTowerStorage(drizzle(pg));
  assert.deepEqual((await pg.query('SELECT * FROM ai_decks')).rows, [{id:'saved', name:'Existing deck', difficulty:'BOSS'}]);
  assert.equal((await pg.query<{ enabled: boolean }>('SELECT enabled FROM tower_settings')).rows[0].enabled, true);
  assert.deepEqual((await pg.query('SELECT * FROM users')).rows, [{id:'preserved'}]);
  assert.equal((await pg.query("SELECT to_regclass('tower_unlocks') IS NOT NULL AS present")).rows[0].present, true);
 } finally { await pg.close(); }
});
test('built startup installer rolls back all new tables if the final migration fails', async () => {
 const pg = new PGlite();
 try {
  await pg.exec('CREATE TABLE users (id text PRIMARY KEY)');
  await assert.rejects(ensureTowerStorage(drizzle(pg)));
  assert.equal((await pg.query("SELECT to_regclass('tower_settings') IS NULL AS absent")).rows[0].absent, true);
 } finally { await pg.close(); }
});
test.after(async () => { await pool.end(); });
