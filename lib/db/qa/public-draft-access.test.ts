import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
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
  for (let index = 0; view.own.deck.length < 25 || view.own.mutationEvent; index++) {
    assert.ok(index < 40); assert.ok(view.own.offers.length || view.own.mutationEvent);
    const response = await request(`/api/draft/sessions/${sessionId}/commands`, 'user', 'POST', { version: view.version, requestId: `isolated-card-${index}`, type: view.own.mutationEvent ? 'MUTATION_SKIP' : 'PICK', pickId: view.own.offers[0] });
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

test('persistent draft quest counts five AI/PvP completions once each and grants unpublished Minion A once', async () => {
 const { ensureDraftParticipationQuest, recordCompletedDraft } = await import('../../../artifacts/api-server/src/lib/draft-participation-quest');
 const { claimDailyQuest } = await import('../../../artifacts/api-server/src/lib/daily-quest-service');
 const aiHookQuest = await ensureDraftParticipationQuest('user',database as any);assert.equal(aiHookQuest.progress,1);
 assert.equal((await ensureDraftParticipationQuest('admin',database as any)).progress,0);
 await database.insert(schema.dailyQuestDefinitionsTable).values({id:'normal-daily-quest',title:'일반 대전',description:'일반 대전 3회',objectiveType:'PLAY_MATCH',targetValue:3,rewardType:'CURRENCY',rewardAmount:10,enabled:true});
 await database.insert(schema.championsTable).values({id:'champion-minion-a',name:'챔피언 미니언 A',abilityName:'무작위',abilityEffects:{},status:'DRAFT'});
 let assignment = await ensureDraftParticipationQuest('other', database as any);
 assert.equal(assignment.progress, 0); assert.equal(assignment.assignmentDate,'LIFETIME');
 assert.equal(assignment.targetValue,5); assert.equal(assignment.rewardTargetId,'champion-minion-a');
 await assert.rejects(() => claimDailyQuest('other',assignment.id));
 for (const id of ['ai-1','pvp-1','ai-2','pvp-2','ai-3']) {
  await recordCompletedDraft('other',id,database as any); await recordCompletedDraft('other',id,database as any);
 }
 assignment = await ensureDraftParticipationQuest('other',database as any); assert.equal(assignment.progress,5);assert.equal(assignment.status,'COMPLETED');
 await database.update(schema.championsTable).set({status:'DISABLED'}).where(eq(schema.championsTable.id,'champion-minion-a'));
 await assert.rejects(() => claimDailyQuest('other',assignment.id), /보상 대상/);
 assert.equal((await ensureDraftParticipationQuest('other',database as any)).status,'COMPLETED');
 await database.update(schema.championsTable).set({status:'DRAFT'}).where(eq(schema.championsTable.id,'champion-minion-a'));
 const claimed = await claimDailyQuest('other',assignment.id); assert.equal(claimed.reward?.granted,true);
 const repeated = await claimDailyQuest('other',assignment.id);assert.equal(repeated.alreadyClaimed,true);
 const collection = await database.select().from(schema.userChampionCollectionsTable);assert.ok(collection.some(c=>c.userId==='other' && c.championDefinitionId==='champion-minion-a' && c.owned));
 await recordCompletedDraft('other','pvp-3',database as any);
 assert.equal((await ensureDraftParticipationQuest('other',database as any)).status,'CLAIMED');
 const response = await request('/api/daily-quests','other');assert.equal(response.status,200);const view=await response.json();assert.ok(view.assignments.some((q:any)=>q.id===assignment.id&&q.status==='CLAIMED'));
 assert.equal(view.assignments.filter((q:any)=>q.assignmentDate==='LIFETIME').length,1);assert.equal(view.assignments.find((q:any)=>q.definitionId==='normal-daily-quest').progress,0);
});

test('champion craft permission persists through admin save, blocks direct craft, and allows quest rewards', async () => {
 let [champion] = await database.select().from(schema.championsTable).where(eq(schema.championsTable.id,'champion-0'));
 const originalStats = [champion!.maxHealth,champion!.abilityCost];
 const saved = await request('/api/admin/champions/champion-0','admin','PATCH',{...champion,isCraftable:false});
 assert.equal(saved.status,200,JSON.stringify(await saved.clone().json()));
 [champion] = await database.select().from(schema.championsTable).where(eq(schema.championsTable.id,'champion-0'));assert.equal(champion!.isCraftable,false);assert.deepEqual([champion!.maxHealth,champion!.abilityCost],originalStats);
 await database.insert(schema.championPrismEconomySettingsTable).values({id:'default',craftCost:20,duplicateReward:5});
 await database.update(schema.usersTable).set({championPrismBalance:50}).where(eq(schema.usersTable.id,'user'));
 assert.equal((await request('/api/prism/champion/craft/champion-0','user','POST')).status,404);
 const {grantReward} = await import('../../../artifacts/api-server/src/lib/reward-service');
 const rewarded = await database.transaction(tx=>grantReward({userId:'admin',sourceType:'ISOLATED_QUEST',sourceId:'craft-disabled',rewardType:'CHAMPION',amount:1,rewardTargetId:'champion-0'},tx as any));assert.equal(rewarded.granted,true);
 const allowed = await request('/api/admin/champions/champion-0','admin','PATCH',{...champion,isCraftable:true});assert.equal(allowed.status,200);
 assert.equal((await request('/api/prism/champion/craft/champion-0','user','POST')).status,200);
 const [user] = await database.select().from(schema.usersTable).where(eq(schema.usersTable.id,'user'));assert.equal(user!.championPrismBalance,30);
});
test('prism revoke is admin-only, validated, atomic, logged and idempotent for both currencies', async () => {
 await database.update(schema.usersTable).set({prismBalance:200,championPrismBalance:100}).where(eq(schema.usersTable.id,'other'));
 const payload = {userId:'other',amount:50,reason:'격리 QA',requestId:'revoke-card-qa-1',kind:'CARD'};
 assert.equal((await request('/api/admin/prism/revoke','user','POST',payload)).status,403);
 assert.equal((await request('/api/admin/prism/revoke',undefined,'POST',payload)).status,401);
 assert.equal((await request('/api/admin/prism/revoke','admin','POST',{...payload,amount:-1})).status,400);
 const first = await request('/api/admin/prism/revoke','admin','POST',payload);assert.equal(first.status,200);assert.equal((await first.json()).balanceAfter,150);
 const repeat = await request('/api/admin/prism/revoke','admin','POST',payload);assert.equal(repeat.status,200);assert.equal((await repeat.json()).alreadyRevoked,true);
 assert.equal((await request('/api/admin/prism/revoke','admin','POST',{...payload,amount:151,requestId:'revoke-too-much'})).status,409);
 const champion = await request('/api/admin/prism/revoke','admin','POST',{...payload,kind:'CHAMPION',requestId:'revoke-champion-qa-1'});assert.equal(champion.status,200);assert.equal((await champion.json()).balanceAfter,50);
 const logs = await database.select().from(schema.prismTransactionsTable);const log=logs.find(item=>item.type==='ADMIN_REVOKE')!;assert.equal(log.amount,-50);assert.equal(JSON.parse(log.metadata!).revokedBy,'admin');assert.equal(JSON.parse(log.metadata!).reason,'격리 QA');
 const [user] = await database.select().from(schema.usersTable).where(eq(schema.usersTable.id,'other'));assert.deepEqual([user!.prismBalance,user!.championPrismBalance],[150,50]);
 const competing = await Promise.all(['revoke-race-1','revoke-race-2'].map(requestId=>request('/api/admin/prism/revoke','admin','POST',{...payload,amount:100,requestId})));
 assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
 const [after] = await database.select().from(schema.usersTable).where(eq(schema.usersTable.id,'other'));assert.equal(after!.prismBalance,50);
});
