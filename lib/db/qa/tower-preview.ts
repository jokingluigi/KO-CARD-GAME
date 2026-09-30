// Local-only browser QA server: disposable PostgreSQL, never uses a production URL.
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
const serverRequire = createRequire(new URL('../../../artifacts/api-server/package.json', import.meta.url));
const express = serverRequire('express');
import * as schema from '../src/schema';
import { towerActionPayload } from '../../../artifacts/ko-game/src/lib/tower-action-payload';
import { projectOnlineGameState } from '../../../artifacts/ko-game/src/lib/online-game-state';
import { getLegalActions } from '../../../artifacts/ko-game/src/game/actions/engine-actions';
import { TOWER_RELIC_DEFINITIONS } from '../../game-engine/src/tower/relic-definitions';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
process.env.NODE_ENV = 'development';
const pg = new PGlite();
const database = drizzle(pg, { schema });
const json = (value: object) => value as Record<string, unknown>;
  const baseline = Object.fromEntries(Object.entries(schema).filter(([key]) => !key.startsWith('tower')));
  const ddl = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(baseline));
  for (const sql of ddl) await pg.exec(sql);
  await database.insert(schema.usersTable).values({ id: 'sentinel', email: 'sentinel@example.invalid', nickname: 'sentinel', passwordHash: 'no-login', currencyBalance: 41 });
  const migration = await readFile(new URL('../migrations/0026_tower_mode.sql', import.meta.url), 'utf8');
  await pg.exec(migration); await pg.exec(migration);
  const unlockMigration = await readFile(new URL('../migrations/0027_tower_unlocks.sql', import.meta.url), 'utf8');
  await pg.exec(unlockMigration); await pg.exec(unlockMigration);
  await database.insert(schema.championsTable).values([
    { id: 'hero', name: 'QA Hero', abilityName: 'None', abilityEffects: {}, status: 'PUBLISHED', maxHealth: 30 },
    { id: 'enemy', name: 'QA Enemy', abilityName: 'None', abilityEffects: {}, status: 'PUBLISHED', maxHealth: 1 },
  ]);
  await database.insert(schema.cardsTable).values(Array.from({ length: 12 }, (_, i) => ({ id: `qa-card-${i}`, name: `QA ${i}`, cardType: 'WRESTLER', cost: 1, attack: 10, health: 10, text: '', status: 'PUBLISHED', keywords: ['RUSH'] })));
  await database.insert(schema.packDefinitionsTable).values({ id: 'qa-pack', name: 'QA Pack', status: 'PUBLISHED' });
  const cardIds = Array.from({ length: 25 }, (_, i) => `qa-card-${i % 12}`);
  await database.insert(schema.towerPresetsTable).values(['normal-a', 'normal-b', 'boss'].map(id => ({ id, data: { id, name: id, championId: 'enemy', cardIds, acts: [1, 2, 3, 4], difficulty: id === 'boss' ? 'BOSS' : 'NORMAL', enabled: true, weight: 1 } })));
  await database.insert(schema.towerStartersTable).values({ id: 'starter', data: { id: 'starter', name: 'Starter', championId: 'hero', cardIds, enabled: true, isDefault: true, initiallyUnlocked: true } });
  await database.insert(schema.towerRelicsTable).values(TOWER_RELIC_DEFINITIONS.map(r => ({ id: r.type, data: { id: r.type, name: r.name, description: r.description, effectType: r.type, values: r.values, enabled: true, initiallyUnlocked: true } })));
  const currency = { type: 'CURRENCY', amount: 10 }; const card = { type: 'CARD', targetId: 'qa-card-0', amount: 2 }; const pack = { type: 'PACK', targetId: 'qa-pack', amount: 1 };
  const bosses = Object.fromEntries(['boss1', 'boss2', 'boss3', 'finalBoss', 'hiddenBoss'].map((slot, i) => [slot, { presetId: 'boss', firstReward: [currency, card, pack, currency, card][i], repeatReward: currency }]));
  await database.insert(schema.towerSeasonsTable).values({ id: 'qa-season', name: 'QA Season', active: true, data: { id: 'qa-season', name: 'QA Season', description: '', protagonistChampionId: 'hero', bosses, hiddenCondition: { type: 'SEASON_PROTAGONIST' }, synergyWeights: { deckTag: 2, supportTag: 3, championTag: 1 } } });
  await database.update(schema.towerSettingsTable).set({ enabled: true });

// Serialize node-postgres clients so transactions cannot interleave in the single local PG connection.
let queue = Promise.resolve();
async function acquire() { let release!: () => void; const next = new Promise<void>(resolve => { release = resolve; }); const previous = queue; queue = previous.then(() => next); await previous; return release; }
async function query(config: string | { text: string; rowMode?: 'array'; types?: { getTypeParser: (oid: number) => (value: string) => unknown } }, values: unknown[] = []) {
  const text = typeof config === 'string' ? config : config.text;
  const parsers = Object.fromEntries([1082, 1114, 1184, 114, 3802].map(oid => [oid, typeof config !== 'string' && config.types ? config.types.getTypeParser(oid) : (value: string) => oid === 114 || oid === 3802 ? JSON.parse(value) : value]));
  return pg.query(text, values, { rowMode: typeof config === 'string' ? undefined : config.rowMode, parsers });
}
class LocalPool extends EventEmitter {
  async connect() { const release = await acquire(); return { query, release }; }
  async query(config: Parameters<typeof query>[0], values?: unknown[]) { const release = await acquire(); try { return await query(config, values); } finally { release(); } }
  async end() {}
}
const require = createRequire(import.meta.url);
require('pg').Pool = LocalPool;
await database.insert(schema.usersTable).values({ id: 'browser-qa', email: 'browser@example.invalid', nickname: 'Browser QA', passwordHash: 'no-login', role: 'ADMIN', currencyBalance: 0 });
await database.insert(schema.userChampionCollectionsTable).values({ userId: 'browser-qa', championDefinitionId: 'hero', owned: true });
const app = express(); app.use(express.json());
const auth = await import('../../../artifacts/api-server/src/lib/auth');
app.get('/qa/session', async (_request, response, next) => { try { await auth.createAuthSession('browser-qa', response); response.redirect('/tower'); } catch (e) { next(e); } });
app.get('/api/auth/me', async (request, response) => { const user = await auth.getAuthenticatedUser(request); response.json({ authenticated: Boolean(user), user }); });
app.get('/api/game-media', (_request, response) => response.json({ items: [] }));
app.use('/api/tower', (await import('../../../artifacts/api-server/src/routes/tower')).default);
app.use('/api/admin/ai-decks', (await import('../../../artifacts/api-server/src/routes/admin-ai-decks')).default);
app.use('/api/admin/tower', (await import('../../../artifacts/api-server/src/routes/admin-tower')).default);
app.use(express.static(new URL('../../../artifacts/ko-game/dist/public', import.meta.url).pathname));
app.get('/{*path}', (_request, response) => response.sendFile(new URL('../../../artifacts/ko-game/dist/public/index.html', import.meta.url).pathname));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => { console.error(error); response.status(500).json({ message: String(error) }); });
const server = app.listen(4173, '0.0.0.0', async () => {
  try {
    const origin = 'http://127.0.0.1:4173';
    const session = await fetch(`${origin}/qa/session`, { redirect: 'manual' });
    assert.equal(session.status, 302);
    const cookie = session.headers.get('set-cookie')!.split(';')[0]!;
    async function call(path: string, body?: unknown, expected = 200) {
      const response = await fetch(`${origin}/api/tower${path}`, { headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
      const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data;
    }
    async function adminDeck(path: string, method = 'GET', body?: unknown, expected = 200) {
      const response = await fetch(`${origin}/api/admin/ai-decks${path}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json(); assert.equal(response.status, expected, JSON.stringify(result)); return result;
    }
    const deckPayload = { name: 'QA difficulty', description: '', championDefinitionId: 'hero', cardDefinitionIds: ['qa-card-0'], enabled: false, displayOrder: 0 };
    const defaultDeck = (await adminDeck('', 'POST', deckPayload, 201)).deck;
    assert.equal(defaultDeck.difficulty, 'NORMAL');
    for (const difficulty of ['NORMAL', 'HARD', 'BOSS']) {
      const saved = (await adminDeck(`/${defaultDeck.id}`, 'PATCH', { ...deckPayload, difficulty })).deck;
      assert.equal(saved.difficulty, difficulty);
      const copied = (await adminDeck(`/${saved.id}/duplicate`, 'POST', {}, 201)).deck;
      assert.equal(copied.difficulty, difficulty);
      assert.deepEqual(copied.cardDefinitionIds, saved.cardDefinitionIds);
    }
    assert.equal((await adminDeck(`/${defaultDeck.id}`, 'PATCH', deckPayload)).deck.difficulty, 'BOSS');
    await adminDeck(`/${defaultDeck.id}`, 'PATCH', { ...deckPayload, difficulty: 'INVALID' }, 422);
    assert.equal((await adminDeck('')).decks.find((d: { id: string }) => d.id === defaultDeck.id).difficulty, 'BOSS');
    console.log('AI deck HTTP QA PASS: default, all difficulties, update, reload, clone, old-client preservation, invalid rejection');
    assert.equal((await call('/availability')).enabled, true);
    assert.equal((await call('/home')).starters.length, 1);
    const created = await call('/runs', { championId: 'hero', starterId: 'starter' }, 201);
    assert.equal(created.run.deck.length, 25); assert.equal('seed' in created.run, false);
    const started = await call(`/runs/${created.run.id}/command`, { version: 0, command: { type: 'CHALLENGE' } });
    assert.ok(started.battle);
    await call(`/runs/${created.run.id}/command`, { version: 0, command: { type: 'CHALLENGE' } }, 409);
    const restarted = await call(`/runs/${created.run.id}/restart`, { version: started.run.version });
    assert.deepEqual(restarted.battle, started.battle);
    const anonymous = await fetch(`${origin}/api/tower/runs/${created.run.id}`); assert.equal(anonymous.status, 401);
    let current = restarted;
    for (let step = 0; step < 30 && current.run.phase === 'BATTLE'; step++) {
      const projected = projectOnlineGameState(current.battle, 'player-1'); assert.ok(projected);
      assert.ok(Array.isArray(projected.players[1].hand));
      assert.ok(projected.players[1].hand.every(card => card.definitionId === '__hidden__'));
      const actions = getLegalActions(projected, 'player-1');
      const action = actions.find(a => a.type === 'MULLIGAN') ?? actions.find(a => a.type === 'ATTACK' && a.target.type === 'PLAYER') ?? actions.find(a => a.type === 'PLAY_WRESTLER') ?? actions.find(a => a.type === 'END_TURN');
      assert.ok(action);
      const payload = towerActionPayload(action);
      current = await call(`/runs/${created.run.id}/action`, { version: current.run.version, action: payload });
    }
    assert.equal(current.run.phase, 'CARD_REWARD');
    assert.equal(new Set(current.run.cardOptions).size, 3);
    const diagnosticResponse = await fetch(`${origin}/api/admin/tower/test/runs`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ starterId: 'starter', floor: 16, hidden: true, seed: 'http-diagnostic', relicIds: [] }) });
    assert.equal(diagnosticResponse.status, 201); const diagnostic = await diagnosticResponse.json();
    assert.equal(diagnostic.run.isTest, true); assert.equal(diagnostic.run.encounter.bossSlot, 'hiddenBoss');
    await call(`/runs/${diagnostic.run.id}`, undefined, 404);
    // The management shortcut starts the complete diagnostic flow even with the player mode OFF.
    await database.update(schema.towerSettingsTable).set({ enabled: false });
    async function fullTest(path: string, body?: unknown, expected = 200) {
      const response = await fetch(`${origin}/api/admin/tower/test/runs${path}`, { headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
      const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data;
    }
    let full = await fullTest('', { starterId: 'starter', fullMode: true, floor: 1, seed: 'full-mode-from-first-floor', hidden: false, relicIds: [] }, 201);
    const fullId = full.run.id;
    assert.equal(full.run.floor, 1); assert.equal(full.run.isTest, true); assert.equal(full.run.fullModeTest, true);
    assert.deepEqual(full.run.relicIds, []); assert.equal(full.run.encounter.bossSlot, undefined);
    assert.equal((await call('/availability')).enabled, false);
    assert.deepEqual((await fullTest(`/${fullId}`)).run, full.run);
    full = await fullTest(`/${fullId}/command`, { version: full.run.version, command: { type: 'CHALLENGE' } });
    for (let step = 0; step < 30 && full.run.phase === 'BATTLE'; step++) {
      const projected = projectOnlineGameState(full.battle, 'player-1'); assert.ok(projected);
      const actions = getLegalActions(projected, 'player-1');
      const action = actions.find(a => a.type === 'MULLIGAN') ?? actions.find(a => a.type === 'ATTACK' && a.target.type === 'PLAYER') ?? actions.find(a => a.type === 'PLAY_WRESTLER') ?? actions.find(a => a.type === 'END_TURN');
      assert.ok(action);
      full = await fullTest(`/${fullId}/action`, { version: full.run.version, action: towerActionPayload(action) });
    }
    assert.equal(full.run.phase, 'CARD_REWARD'); assert.equal(full.run.cardOptions.length, 3);
    full = await fullTest(`/${fullId}/command`, { version: full.run.version, command: { type: 'SKIP_CARD' } });
    assert.equal(full.run.floor, 2); assert.equal(full.run.phase, 'HUB'); assert.equal(full.run.deck.length, 25);
    assert.equal((await fullTest(`/${fullId}`)).run.floor, 2);
    assert.equal((await call('/availability')).enabled, false);
    assert.equal((await database.select().from(schema.towerUnlocksTable)).length, 0);
    assert.equal((await database.select().from(schema.towerBossReceiptsTable)).length, 0);
    console.log('Full-mode diagnostic HTTP QA PASS: mode OFF, first-floor start, reconnect, real battle, card rewards, second-floor continuation, isolated progression');
    console.log('HTTP QA PASS: session, availability, owned starter, creation, challenge, stale conflict, deterministic restart, auth isolation, real battle actions + AI + reward offers, admin hidden diagnostic isolation');
    if (process.argv.includes('--smoke')) { server.close(); await pg.close(); }
    else console.log('Tower disposable QA ready: http://localhost:4173/qa/session');
  } catch (error) { console.error('HTTP QA FAILED', error); server.close(); await pg.close(); process.exitCode = 1; }
});
