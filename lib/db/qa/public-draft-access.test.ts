import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import * as schema from '../src/schema';

// Production never receives test users, sessions or setting writes.
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
const pg = new PGlite();
const database = drizzle(pg, { schema });
let server: import('node:http').Server;
let origin: string;
const cookies: Record<string, string> = {};
let sessionId: string;

before(async () => {
  for (const ddl of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) await pg.exec(ddl);
  await pg.exec(await readFile(new URL('../migrations/0033_server_maintenance.sql', import.meta.url), 'utf8'));
  const { db } = await import('../src/index');
  for (const method of ['select', 'insert', 'update', 'delete', 'transaction', 'execute'] as const) Object.assign(db, { [method]: database[method].bind(database) });
  const { hashPassword } = await import('../../../artifacts/api-server/src/lib/auth');
  const passwordHash = await hashPassword('IsolatedDraftQA123');
  for (const [id, role] of [['user', 'USER'], ['other', 'USER'], ['admin', 'ADMIN']] as const) {
    await database.insert(schema.usersTable).values({ id, role, email: `${id}@draft.example.invalid`, nickname: id, passwordHash });
  }
  await database.insert(schema.cardsTable).values(Array.from({ length: 14 }, (_, index) => ({
    id: `card-${index}`, name: `격리 선수 ${index}`, cardType: 'WRESTLER', rarity: 'NORMAL', cost: 2, attack: 2, health: 3,
    text: '', status: 'PUBLISHED', keywords: [], effectConfig: {},
  })));
  await database.insert(schema.championsTable).values(Array.from({ length: 3 }, (_, index) => ({
    id: `champion-${index}`, name: `격리 챔피언 ${index}`, abilityName: '없음', abilityEffects: {}, status: 'PUBLISHED',
  })));
  const { default: app } = await import('../../../artifacts/api-server/src/app');
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object'); origin = `http://127.0.0.1:${address.port}`;
  for (const id of ['user', 'other', 'admin']) {
    const response = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@draft.example.invalid`, password: 'IsolatedDraftQA123' }) });
    assert.equal(response.status, 200); cookies[id] = response.headers.get('set-cookie')!.split(';')[0]!;
  }
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await pg.close(); const { pool } = await import('../src/index'); await pool.end();
});
function request(path: string, user?: string, method = 'GET', body?: unknown) {
  return fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Cookie: cookies[user]! } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
test('draft still requires login and admin management still requires ADMIN', async () => {
  assert.equal((await request('/api/draft')).status, 401);
  assert.equal((await request('/api/draft', 'user')).status, 200);
  assert.equal((await request('/api/admin/draft', 'user')).status, 403);
  assert.equal((await request('/api/admin/draft', 'admin')).status, 200);
});
test('ordinary users cannot change ON/OFF through either settings URL', async () => {
  for (const path of ['/api/draft/settings', '/api/admin/draft/settings']) assert.equal((await request(path, 'user', 'PUT', { enabled: true })).status, 403);
  assert.deepEqual(await (await request('/api/draft/availability', 'user')).json(), { enabled: false });
});
test('OFF rejects new regular-user sessions; admin ON allows them', async () => {
  assert.equal((await request('/api/draft/sessions', 'user', 'POST', { mode: 'AI' })).status, 503);
  assert.equal((await request('/api/draft/settings', 'admin', 'PUT', { enabled: true })).status, 200);
  assert.deepEqual(await (await request('/api/draft/availability', 'user')).json(), { enabled: true });
  const response = await request('/api/draft/sessions', 'user', 'POST', { mode: 'AI' });
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const view = await response.json(); sessionId = view.id; assert.equal(view.phase, 'DRAFT'); assert.equal(view.own.offers.length, 3);
});
test('regular-user selection advances, persists and rejects nonparticipant access', async () => {
  const view = await (await request(`/api/draft/sessions/${sessionId}`, 'user')).json();
  const response = await request(`/api/draft/sessions/${sessionId}/commands`, 'user', 'POST', { version: view.version, requestId: 'isolated-pick-1', type: 'PICK', pickId: view.own.offers[0] });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const next = await response.json(); assert.ok(next.own.championId); assert.ok(next.version > view.version);
  assert.equal((await request(`/api/draft/sessions/${sessionId}`, 'other')).status, 403);
  const restored = await (await request('/api/draft', 'user')).json(); assert.equal(restored.currentId, sessionId);
});
test('regular user completes 25 picks and starts a real persisted draft battle', async () => {
  let view = await (await request(`/api/draft/sessions/${sessionId}`, 'user')).json();
  for (let index = 0; view.own.deck.length < 25; index++) {
    assert.ok(index < 25); assert.ok(view.own.offers.length);
    const response = await request(`/api/draft/sessions/${sessionId}/commands`, 'user', 'POST', { version: view.version, requestId: `isolated-card-${index}`, type: 'PICK', pickId: view.own.offers[0] });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json())); view = await response.json();
  }
  const ready = await request(`/api/draft/sessions/${sessionId}/commands`, 'user', 'POST', { version: view.version, requestId: 'isolated-ready', type: 'READY' });
  assert.equal(ready.status, 200, JSON.stringify(await ready.clone().json()));
  assert.equal((await ready.json()).phase, 'BATTLE');
  const battle = await request(`/api/draft/sessions/${sessionId}/battle`, 'user');
  assert.equal(battle.status, 200); const snapshot = await battle.json(); assert.equal(snapshot.type, 'MATCH_SNAPSHOT'); assert.equal(snapshot.state.status, 'IN_PROGRESS');
  assert.equal((await request(`/api/draft/sessions/${sessionId}/battle`, 'other')).status, 403);
});

test('PvP queue automatically pairs users, restores repeat requests and permits cancellation', async () => {
  const abort = async (user: string, view: any) => request(`/api/draft/sessions/${view.id}/commands`, user, 'POST', { version: view.version, requestId: `abort-${user}-${view.id}`, type: 'ABORT' });
  await abort('user', await (await request(`/api/draft/sessions/${sessionId}`, 'user')).json());
  const firstResponse = await request('/api/draft/matchmaking', 'user', 'POST');
  assert.equal(firstResponse.status, 200); const first = await firstResponse.json(); assert.equal(first.phase, 'WAITING');
  const repeated = await (await request('/api/draft/matchmaking', 'user', 'POST')).json(); assert.equal(repeated.id, first.id);
  const secondResponse = await request('/api/draft/matchmaking', 'other', 'POST');
  assert.equal(secondResponse.status, 200); const second = await secondResponse.json(); assert.equal(second.id, first.id); assert.equal(second.phase, 'DRAFT');
  const restored = await (await request(`/api/draft/sessions/${first.id}`, 'user')).json(); assert.equal(restored.phase, 'DRAFT'); assert.equal(restored.own.offers.length, 3);
  const third = await (await request('/api/draft/matchmaking', 'admin', 'POST')).json(); assert.notEqual(third.id, first.id); assert.equal(third.phase, 'WAITING');
  assert.equal((await abort('admin', third)).status, 200);
  assert.equal((await (await request('/api/draft', 'admin')).json()).currentId, null);
  assert.equal((await (await request('/api/draft', 'user')).json()).poolWarning, undefined);
});
test('queue requires login and respects admin OFF switch', async () => {
  assert.equal((await request('/api/draft/matchmaking', undefined, 'POST')).status, 401);
  assert.equal((await request('/api/draft/settings', 'admin', 'PUT', { enabled: false })).status, 200);
  assert.equal((await request('/api/draft/matchmaking', 'admin', 'POST')).status, 503);
});
