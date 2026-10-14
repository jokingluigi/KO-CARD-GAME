import { generateDrizzleJson,generateMigration } from "drizzle-kit/api";
import * as schema from "../src/schema";
import { fileURLToPath } from "node:url";
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
const require = createRequire(new URL('../../../artifacts/api-server/package.json', import.meta.url));
const { build } = require('esbuild');
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
const output = new URL('../../../artifacts/api-server/dist/startup-schema-qa.mjs', import.meta.url);
await build({ entryPoints: [fileURLToPath(new URL('../../../artifacts/api-server/src/lib/startup-schema.ts', import.meta.url))], outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: { '.sql': 'text' } });
const { ensureTowerStorage } = await import(output.href);
const { pool } = await import('../src/index');

test('built startup installer atomically adds Tower and AI difficulty, preserves existing data and flags on restart', async () => {
 const pg = new PGlite();
 try {
 for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await pg.exec(ddl);
 await pg.exec("INSERT INTO users(id,email,nickname,password_hash) VALUES ('preserved','startup@qa.invalid','Startup QA','fixture-only'); INSERT INTO ai_decks(id,name) VALUES ('saved','Existing deck');");

  await ensureTowerStorage(drizzle(pg));
  assert.equal((await pg.query<{ enabled: boolean }>('SELECT enabled FROM tower_settings')).rows[0].enabled, false);
  assert.equal((await pg.query<{ difficulty: string }>('SELECT difficulty FROM ai_decks')).rows[0].difficulty, 'NORMAL');
  await pg.exec("UPDATE ai_decks SET difficulty='BOSS'; UPDATE tower_settings SET enabled=true;");
  await ensureTowerStorage(drizzle(pg));
  assert.deepEqual((await pg.query('SELECT id,name,difficulty FROM ai_decks WHERE id=\'saved\'')).rows, [{id:'saved', name:'Existing deck', difficulty:'BOSS'}]);
  assert.equal((await pg.query<{ enabled: boolean }>('SELECT enabled FROM tower_settings')).rows[0].enabled, true);
  assert.deepEqual((await pg.query('SELECT id FROM users')).rows, [{id:'preserved'}]);
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
test('restart never recreates deleted catalog IDs or rewrites administrator-created cards and champions', async () => {
 const pg = new PGlite();
 try {
  for (const ddl of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) await pg.exec(ddl);
  const database = drizzle(pg, { schema });
  await database.insert(schema.cardsTable).values([
   { id: 'epic-spell-forced-exchange', name: '강제 교환', cardType: 'TECHNIQUE', cost: 4, attack: 0, health: 0, text: '관리자 최신 효과', rarity: 'NORMAL' },
   { id: 'owner-card', name: '좀비', cardType: 'WRESTLER', cost: 5, attack: 7, health: 9, text: '관리자 최신 효과', isToken: true },
  ]);
  await database.insert(schema.championsTable).values([
   { id: 'crisis-awakening-champion', name: '각성 챔피언', abilityName: '최신 능력', abilityEffects: {} },
   { id: 'champion-minion-a', name: '챔피언 미니언 A', abilityName: '최신 능력', abilityEffects: {} },
   { id: 'champion-tower-vanilla', name: '타워 일반 상대', abilityName: '최신 능력', abilityEffects: {} },
   { id: 'owner-champion', name: '퍼플레인', abilityName: '최신 능력', abilityText: '관리자 최신 효과', abilityEffects: {}, hasQuest: false },
  ]);
  await pg.exec("DELETE FROM cards WHERE id='epic-spell-forced-exchange'; DELETE FROM champions WHERE id<>'owner-champion';");
  const beforeCards = (await pg.query('SELECT * FROM cards ORDER BY id')).rows;
  const beforeChampions = (await pg.query('SELECT * FROM champions ORDER BY id')).rows;
  for (let restart = 0; restart < 3; restart++) {
   await ensureTowerStorage(drizzle(pg));
   assert.deepEqual((await pg.query('SELECT * FROM cards ORDER BY id')).rows, beforeCards);
   assert.deepEqual((await pg.query('SELECT * FROM champions ORDER BY id')).rows, beforeChampions);
  }
 } finally { await pg.close(); }
});
test.after(async () => { await pool.end(); });
