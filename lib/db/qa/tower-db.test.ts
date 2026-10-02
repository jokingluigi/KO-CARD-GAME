import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { eq } from 'drizzle-orm';
import * as schema from '../src/schema';
import type { TowerRun } from '../../game-engine/src/tower/types';
import type { TowerSnapshot } from '../../game-engine/src/tower/battle';
import { encounterFor } from '../../game-engine/src/tower/domain';
import { executeAction, getLegalActions } from '../../../artifacts/ko-game/src/game/actions/engine-actions';
import { TOWER_RELIC_DEFINITIONS } from '../../game-engine/src/tower/relic-definitions';

// This suite always creates an isolated PostgreSQL WASM database. The URL only permits module initialization; no connection uses it.
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
const pg = new PGlite();
const database = drizzle(pg, { schema });
let store: typeof import('../../../artifacts/api-server/src/lib/tower-run-store');
let load: typeof import('../../../artifacts/api-server/src/lib/tower-catalog');
let snapshot: TowerSnapshot;
const productionType = () => database as unknown as Parameters<typeof store.createPersistedTowerRun>[4];
const json = (value: object) => value as unknown as Record<string, unknown>;
before(async () => {
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
  await database.insert(schema.aiDecksTable).values({id:"qa-boss",name:"AI Match Boss",championDefinitionId:"enemy",cardDefinitionIds:cardIds,enabled:true});
  await database.insert(schema.towerPresetsTable).values(['normal-a', 'normal-b', 'boss'].map(id => ({ id, data: { id, name: id, championId: 'enemy', cardIds, acts: [1, 2, 3, 4], difficulty: id === 'boss' ? 'BOSS' : 'NORMAL', enabled: true, weight: 1 } })));
  await database.insert(schema.towerStartersTable).values({ id: 'starter', data: { id: 'starter', name: 'Starter', championId: 'hero', cardIds, enabled: true, isDefault: true, initiallyUnlocked: true } });
  await database.insert(schema.towerRelicsTable).values(TOWER_RELIC_DEFINITIONS.map(r => ({ id: r.type, data: { id: r.type, name: r.name, description: r.description, effectType: r.type, values: r.values, enabled: true, initiallyUnlocked: true } })));
  const currency = { type: 'CURRENCY', amount: 10 }; const card = { type: 'CARD', targetId: 'qa-card-0', amount: 2 }; const pack = { type: 'PACK', targetId: 'qa-pack', amount: 1 };
  const bosses = Object.fromEntries(['boss1', 'boss2', 'boss3', 'finalBoss', 'hiddenBoss'].map((slot, i) => [slot, { presetId: 'boss', firstReward: [currency, card, pack, currency, card][i], repeatReward: currency }]));
  await database.insert(schema.towerSeasonsTable).values({ id: 'qa-season', name: 'QA Season', active: true, data: { id: 'qa-season', name: 'QA Season', description: '', protagonistChampionId: 'hero', bosses, hiddenCondition: { type: 'SEASON_PROTAGONIST' }, synergyWeights: { deckTag: 2, supportTag: 3, championTag: 1 } } });
  await database.update(schema.towerSettingsTable).set({ enabled: true });
  store = await import('../../../artifacts/api-server/src/lib/tower-run-store');
  load = await import('../../../artifacts/api-server/src/lib/tower-catalog');
  snapshot = await load.loadTowerSnapshot(productionType());
});
after(async () => { await pg.close(); const { pool } = await import('../src/index'); await pool.end(); });
async function user(id: string, owned = true) {
  await database.insert(schema.usersTable).values({ id, email: `${id}@example.invalid`, nickname: id, passwordHash: 'no-login' });
  if (owned) await database.insert(schema.userChampionCollectionsTable).values({ userId: id, championDefinitionId: 'hero', owned: true });
  return store.createPersistedTowerRun(id, 'hero', 'starter', snapshot, productionType());
}
async function bossRun(id: string, floor: number, isTest = false) {
  let run = await user(id); run = { ...run, floor, isTest, encounter: encounterFor({ ...run, floor }, snapshot.catalog) };
  await database.update(schema.towerRunsTable).set({ state: json(run), isTest }).where(eq(schema.towerRunsTable.id, run.id));
  return store.applyTowerCommand(id, run.id, run.version, { type: 'CHALLENGE' }, productionType());
}
function win(battle: NonNullable<Awaited<ReturnType<typeof bossRun>>['battle']>) {
  let state = battle;
  for (let n = 0; n < 60 && state.status !== 'FINISHED'; n++) {
    const playerId = state.openingMulligan ? state.players.find(p => !p.mulliganUsed)!.id : state.activePlayerId!;
    const actions = getLegalActions(state, playerId);
    const selected = playerId === 'player-1' ? actions.find(a => a.type === 'ATTACK' && a.target.type === 'PLAYER') ?? actions.find(a => a.type === 'PLAY_WRESTLER') ?? actions[0] : actions.find(a => a.type === 'MULLIGAN') ?? actions.find(a => a.type === 'END_TURN');
    assert.ok(selected); const result = executeAction(state, selected); assert.ok(result.success); state = result.state;
  }
  assert.equal(state.winnerId, 'player-1'); return state;
}
test('additive migration applies twice, preserves original rows and defaults OFF', async () => {
  const [sentinel] = await database.select().from(schema.usersTable).where(eq(schema.usersTable.id, 'sentinel'));
  assert.equal(sentinel!.currencyBalance, 41);
  const result = await pg.query("select column_default from information_schema.columns where table_name='tower_settings' and column_name='enabled'");
  assert.equal(result.rows[0]!.column_default, 'false');
});
test('real ownership, run persistence, simultaneous creation and stale transitions are enforced', async () => {
  await assert.rejects(user('unowned', false), /보유/);
  const run = await user('owner');
  await assert.rejects(store.createPersistedTowerRun('owner', 'hero', 'starter', snapshot, productionType()), /진행 중/);
  const races = await Promise.allSettled([1, 2].map(() => store.applyTowerCommand('owner', run.id, run.version, { type: 'CHALLENGE' }, productionType())));
  assert.equal(races.filter(r => r.status === 'fulfilled').length, 1);
  const [row] = await database.select().from(schema.towerRunsTable).where(eq(schema.towerRunsTable.id, run.id));
  assert.equal(row!.version, 1); assert.equal(row!.state.seed, run.seed); assert.equal(row!.state.phase, 'BATTLE');
});
test('battle reconnect restores identical opening and selected relic values from immutable run snapshot', async () => {
  const run = await user('restart');
  const withRelic = { ...run, relicIds: ['MAX_FIELD_ONE'] };
  await database.update(schema.towerRunsTable).set({ state: json(withRelic) }).where(eq(schema.towerRunsTable.id, run.id));
  const started = await store.applyTowerCommand('restart', run.id, 0, { type: 'CHALLENGE' }, productionType());
  await database.update(schema.towerRelicsTable).set({ data: { ...snapshot.catalog.relics.find(r => r.id === 'MAX_FIELD_ONE')!, values: { attack: 20, health: 20 } } }).where(eq(schema.towerRelicsTable.id, 'MAX_FIELD_ONE'));
  const restarted = await store.restartTowerBattle('restart', run.id, started.run.version, productionType());
  assert.deepEqual(restarted.battle, JSON.parse(JSON.stringify(started.battle))); assert.equal(restarted.battle!.tower!.relics[0]!.values.attack, 4);
});
test('first/repeat currency, card and pack boss rewards really issue once across duplicate requests', async () => {
  for (const [id, floor] of [['currency', 4], ['card', 8], ['pack', 12]] as const) {
    const started = await bossRun(id, floor); const battle = win(started.battle!);
    const settled = await store.saveTowerBattle(id, started.run.id, started.run.version, battle, productionType());
    assert.equal(settled.run.phase, 'RELIC_REWARD');
    await assert.rejects(store.saveTowerBattle(id, started.run.id, started.run.version, battle, productionType()), /진행 상태/);
    const receipts = await database.select().from(schema.towerBossReceiptsTable).where(eq(schema.towerBossReceiptsTable.runId, started.run.id)); assert.equal(receipts.length, 1); assert.equal(receipts[0]!.firstClear, true);
    await database.update(schema.towerRunsTable).set({ ended: true }).where(eq(schema.towerRunsTable.id, started.run.id));
    const another = await store.createPersistedTowerRun(id, 'hero', 'starter', snapshot, productionType());
    const nextRun = { ...another, floor, encounter: encounterFor({ ...another, floor }, snapshot.catalog) };
    await database.update(schema.towerRunsTable).set({ state: json(nextRun) }).where(eq(schema.towerRunsTable.id, another.id));
    const again = await store.applyTowerCommand(id, another.id, 0, { type: 'CHALLENGE' }, productionType());
    await store.saveTowerBattle(id, another.id, again.run.version, win(again.battle!), productionType());
    const repeats = await database.select().from(schema.towerBossReceiptsTable).where(eq(schema.towerBossReceiptsTable.runId, another.id)); assert.equal(repeats[0]!.firstClear, false);
  }
  assert.equal((await database.select().from(schema.usersTable).where(eq(schema.usersTable.id, 'currency')))[0]!.currencyBalance, 20);
  assert.equal((await database.select().from(schema.userCardCollectionsTable).where(eq(schema.userCardCollectionsTable.userId, 'card')))[0]!.quantity, 2);
  assert.equal((await database.select().from(schema.userPackInventoryTable).where(eq(schema.userPackInventoryTable.userId, 'pack')))[0]!.quantity, 1);
});
test('reward failure rolls back first-clear reservation, run version and receipt', async () => {
  const started = await bossRun('rollback', 4);
  const broken = structuredClone(snapshot); broken.catalog.season.bosses.boss1.firstReward = { type: 'CARD', targetId: 'missing-card', amount: 1 };
  await database.update(schema.towerRunsTable).set({ snapshot: json(broken) }).where(eq(schema.towerRunsTable.id, started.run.id));
  await assert.rejects(store.saveTowerBattle('rollback', started.run.id, started.run.version, win(started.battle!), productionType()), /보상 대상/);
  const row = (await database.select().from(schema.towerRunsTable).where(eq(schema.towerRunsTable.id, started.run.id)))[0]!;
  assert.equal(row.version, started.run.version); assert.equal(row.state.phase, 'BATTLE');
  assert.equal((await database.select().from(schema.towerBossClearsTable).where(eq(schema.towerBossClearsTable.userId, 'rollback'))).length, 0);
  assert.equal((await database.select().from(schema.towerBossReceiptsTable).where(eq(schema.towerBossReceiptsTable.runId, started.run.id))).length, 0);
});
test('administrator test battles cannot grant real rewards or first-clear records', async () => {
  const started = await bossRun('diagnostic', 4, true);
  await store.saveTowerBattle('diagnostic', started.run.id, started.run.version, win(started.battle!), productionType());
  assert.equal((await database.select().from(schema.rewardGrantsTable).where(eq(schema.rewardGrantsTable.userId, 'diagnostic'))).length, 0);
  assert.equal((await database.select().from(schema.towerBossClearsTable).where(eq(schema.towerBossClearsTable.userId, 'diagnostic'))).length, 0);
});

test('administrator closure prevents stale battles from reopening the run or issuing rewards', async () => {
  const started = await bossRun('closed', 4);
  await store.closeTowerRun(started.run.id, productionType());
  await store.closeTowerRun(started.run.id, productionType());
  const row = (await database.select().from(schema.towerRunsTable).where(eq(schema.towerRunsTable.id, started.run.id)))[0]!;
  assert.equal(row.ended, true); assert.equal(row.state.ended, true); assert.equal(row.state.phase, 'RESULT');
  assert.equal(row.version, started.run.version + 1);
  await assert.rejects(store.saveTowerBattle('closed', started.run.id, started.run.version, win(started.battle!), productionType()), /이미 종료/);
  await assert.rejects(store.restartTowerBattle('closed', started.run.id, row.version, productionType()), /이미 종료/);
  assert.equal((await database.select().from(schema.rewardGrantsTable).where(eq(schema.rewardGrantsTable.userId, 'closed'))).length, 0);
});

test('complete persisted 16-floor run keeps 25 cards, offers nine distinct relics and settles hidden ending', async () => {
  let run = await user('full-run');
  const offered = new Set<string>();
  for (let battleIndex = 0; battleIndex < 17; battleIndex++) {
    assert.equal(run.phase, 'HUB'); assert.equal(run.deck.length, 25);
    const started = await store.applyTowerCommand('full-run', run.id, run.version, { type: 'CHALLENGE' }, productionType());
    const settled = await store.saveTowerBattle('full-run', run.id, started.run.version, win(started.battle!), productionType());
    run = settled.run;
    if (run.phase === 'CARD_REWARD') {
      assert.equal(new Set(run.cardOptions).size, 3);
      if (battleIndex % 2) run = (await store.applyTowerCommand('full-run', run.id, run.version, { type: 'SKIP_CARD' }, productionType())).run;
      else {
        run = (await store.applyTowerCommand('full-run', run.id, run.version, { type: 'SELECT_CARD', cardId: run.cardOptions[0]! }, productionType())).run;
        run = (await store.applyTowerCommand('full-run', run.id, run.version, { type: 'REPLACE_CARD', deckIndex: 0 }, productionType())).run;
      }
    } else if (run.phase === 'RELIC_REWARD') {
      for (const id of run.relicOptions) { assert.equal(offered.has(id), false); offered.add(id); }
      // Choose combat-neutral relics to keep fixture matches focused on persistence.
      const id = run.relicOptions.find(id => !['MAX_FIELD_ONE', 'MAX_FIELD_TWO', 'FIRST_SUMMON_COST_DOWN_NO_ATTACK'].includes(id)) ?? run.relicOptions[0]!;
      run = (await store.applyTowerCommand('full-run', run.id, run.version, { type: 'SELECT_RELIC', relicId: id }, productionType())).run;
    }
    assert.equal(run.deck.length, 25);
  }
  assert.equal(run.phase, 'RESULT'); assert.equal(run.ended, true); assert.equal(run.regularClear, true); assert.equal(run.hiddenClear, true);
  assert.equal(run.relicIds.length, 3); assert.equal(offered.size, 9); assert.equal(run.defeatedBossSlots.length, 5);
  const receipts = await database.select().from(schema.towerBossReceiptsTable).where(eq(schema.towerBossReceiptsTable.runId, run.id));
  assert.equal(receipts.length, 5);
});

test('administrator diagnostic starts hidden boss with selected seed and relics without ownership or account progression', async () => {
  await database.insert(schema.usersTable).values({ id: 'admin-run', email: 'admin-run@example.invalid', nickname: 'admin-run', passwordHash: 'no-login', role: 'ADMIN' });
  const run = await store.createTowerDiagnostic('admin-run', { starterId: 'starter', floor: 1, hidden: true, seed: 'chosen-admin-seed', relicIds: ['MAX_FIELD_ONE', 'FIRST_RETIRE_SURVIVE', 'ON_RETIRE_NEXT_BUFF'] }, snapshot, productionType());
  assert.equal(run.seed, 'chosen-admin-seed'); assert.equal(run.isTest, true); assert.equal(run.floor, 16); assert.equal(run.encounter.bossSlot, 'hiddenBoss');
  const started = await store.applyTowerCommand('admin-run', run.id, run.version, { type: 'CHALLENGE' }, productionType());
  const finished = await store.saveTowerBattle('admin-run', run.id, started.run.version, win(started.battle!), productionType());
  assert.equal(finished.run.hiddenClear, true);
  assert.equal((await database.select().from(schema.towerBossClearsTable).where(eq(schema.towerBossClearsTable.userId, 'admin-run'))).length, 0);
  assert.equal((await database.select().from(schema.rewardGrantsTable).where(eq(schema.rewardGrantsTable.userId, 'admin-run'))).length, 0);
  await assert.rejects(store.createTowerDiagnostic('admin-run', { starterId: 'starter', floor: 1, seed: 'invalid', relicIds: ['missing'] }, snapshot, productionType()));
});

test('dialogue cursor persists and skip starts exactly one battle using snapshotted story', async () => {
  let run = await user('dialogue');
  const story = structuredClone(snapshot);
  story.catalog.characters = [{ id: 'left', displayName: 'Left', sprites: { NEUTRAL: '/left.png' } }, { id: 'right', displayName: 'Right', sprites: { NEUTRAL: '/right.png' } }];
  story.catalog.scenes = [{ id: 'boss-dialogue', name: 'Boss', lines: [{ speakerId: 'left', expression: 'ANGRY', side: 'LEFT', text: 'First', order: 0 }, { speakerId: 'right', expression: 'HAPPY', side: 'RIGHT', text: 'Second', order: 1 }] }];
  story.catalog.season.bosses.boss1.protagonistSceneId = 'boss-dialogue';
  run = { ...run, floor: 4 }; run.encounter = encounterFor(run, story.catalog);
  await database.update(schema.towerRunsTable).set({ state: json(run), snapshot: json(story) }).where(eq(schema.towerRunsTable.id, run.id));
  const start = await store.applyTowerCommand('dialogue', run.id, run.version, { type: 'CHALLENGE' }, productionType());
  assert.equal(start.run.phase, 'DIALOGUE'); assert.equal(start.battle, null);
  const next = await store.applyTowerCommand('dialogue', run.id, start.run.version, { type: 'DIALOGUE_NEXT' }, productionType());
  const saved = (await database.select().from(schema.towerRunsTable).where(eq(schema.towerRunsTable.id, run.id)))[0]!;
  assert.equal(saved.state.dialogueIndex, 1); assert.equal(saved.currentBattle, null);
  const skipped = await store.applyTowerCommand('dialogue', run.id, next.run.version, { type: 'DIALOGUE_SKIP' }, productionType());
  assert.equal(skipped.run.phase, 'BATTLE'); assert.ok(skipped.battle);
  await assert.rejects(store.applyTowerCommand('dialogue', run.id, next.run.version, { type: 'DIALOGUE_SKIP' }, productionType()), /진행 상태/);
});
test('hidden defeat preserves persisted normal clear and already granted final boss reward', async () => {
  const started = await bossRun('hidden-loss', 16);
  const regular = await store.saveTowerBattle('hidden-loss', started.run.id, started.run.version, win(started.battle!), productionType());
  assert.equal(regular.run.regularClear, true); assert.equal(regular.run.encounter.bossSlot, 'hiddenBoss');
  const hidden = await store.applyTowerCommand('hidden-loss', started.run.id, regular.run.version, { type: 'CHALLENGE' }, productionType());
  const lost = executeAction(hidden.battle!, { type: 'SURRENDER', playerId: 'player-1' }); assert.ok(lost.success);
  const result = await store.saveTowerBattle('hidden-loss', started.run.id, hidden.run.version, lost.state, productionType());
  assert.equal(result.run.regularClear, true); assert.equal(result.run.hiddenClear, false); assert.equal(result.run.ended, true);
  const receipts = await database.select().from(schema.towerBossReceiptsTable).where(eq(schema.towerBossReceiptsTable.runId, started.run.id));
  assert.equal(receipts.length, 1); assert.equal(receipts[0]!.bossSlotId, 'finalBoss');
  assert.equal((await database.select().from(schema.usersTable).where(eq(schema.usersTable.id, 'hidden-loss')))[0]!.currencyBalance, 10);
});

test('earned relic and alternative starter unlocks persist after conditions change; diagnostics earn none', async () => {
  let run = await user('unlock-user');
  const unlockSnapshot = structuredClone(snapshot);
  unlockSnapshot.catalog.relics[0] = { ...unlockSnapshot.catalog.relics[0]!, initiallyUnlocked: false, unlockCondition: { type: 'CARD', id: 'qa-card-0' } };
  unlockSnapshot.catalog.starters.push({ ...unlockSnapshot.catalog.starters[0]!, id: 'alternative', isDefault: false, initiallyUnlocked: false, unlockCondition: { type: 'CARD', id: 'qa-card-0' } });
  await database.update(schema.towerRunsTable).set({ snapshot: json(unlockSnapshot) }).where(eq(schema.towerRunsTable.id, run.id));
  const ended = await store.applyTowerCommand('unlock-user', run.id, run.version, { type: 'ABANDON' }, productionType()); assert.equal(ended.run.ended, true);
  const unlocks = await database.select().from(schema.towerUnlocksTable).where(eq(schema.towerUnlocksTable.userId, 'unlock-user'));
  assert.equal(unlocks.length, 2);
  const changed = structuredClone(unlockSnapshot); changed.catalog.starters[1]!.unlockCondition = { type: 'CLEAR_COUNT', count: 999 };
  run = await store.createPersistedTowerRun('unlock-user', 'hero', 'alternative', changed, productionType());
  assert.equal(run.starterId, 'alternative');
  await database.insert(schema.usersTable).values({ id: 'unlock-admin', email: 'unlock-admin@example.invalid', nickname: 'unlock-admin', passwordHash: 'no-login' });
  const diagnostic = await store.createTowerDiagnostic('unlock-admin', { starterId: 'starter', seed: 'unlock-test', floor: 1, relicIds: [] }, unlockSnapshot, productionType());
  await store.applyTowerCommand('unlock-admin', diagnostic.id, diagnostic.version, { type: 'ABANDON' }, productionType());
  assert.equal((await database.select().from(schema.towerUnlocksTable).where(eq(schema.towerUnlocksTable.userId, 'unlock-admin'))).length, 0);
});

test('catalog validation rejects an insufficient relic pool and unresolved condition references before enabling', async () => {
  const saved = await database.select().from(schema.towerRelicsTable);
  try {
    for (const row of saved.slice(0, 16)) await database.update(schema.towerRelicsTable).set({ data: { ...row.data, enabled: false } }).where(eq(schema.towerRelicsTable.id, row.id));
    await assert.rejects(load.loadTowerSnapshot(productionType()), /유물 9종/);
  } finally { for (const row of saved) await database.update(schema.towerRelicsTable).set({ data: row.data }).where(eq(schema.towerRelicsTable.id, row.id)); }
  const [season] = await database.select().from(schema.towerSeasonsTable).where(eq(schema.towerSeasonsTable.id, 'qa-season'));
  try {
    await database.update(schema.towerSeasonsTable).set({ data: { ...season!.data, hiddenCondition: { type: 'CARD', id: 'missing-condition-card' } } }).where(eq(schema.towerSeasonsTable.id, 'qa-season'));
    await assert.rejects(load.loadTowerSnapshot(productionType()), /조건이 참조/);
  } finally { await database.update(schema.towerSeasonsTable).set({ data: season!.data }).where(eq(schema.towerSeasonsTable.id, 'qa-season')); }
});

for (const hidden of [false, true]) test(`full-mode test plays all floors and story with natural hidden branch ${hidden}`, async () => {
  const userId = `full-diagnostic-${hidden}`;
  const original = await user(userId);
  const configured = structuredClone(snapshot);
  configured.catalog.scenes = [{ id: 'full-story', name: 'Full story', lines: [
    { speakerId: 'actor', expression: 'NEUTRAL', side: 'LEFT', text: '보스 등장', order: 0 },
    { speakerId: 'actor', expression: 'SERIOUS', side: 'RIGHT', text: '대결 시작', order: 1 },
  ] }];
  configured.catalog.characters = [{ id: 'actor', displayName: '이야기 화자', sprites: { NEUTRAL: '/qa-neutral.png' } }];
  for (const boss of Object.values(configured.catalog.season.bosses)) if (boss) boss.commonSceneId = 'full-story';
  configured.catalog.season.hiddenCondition = { type: 'CHAMPION', id: hidden ? 'hero' : 'enemy' };
  let run = await store.createTowerDiagnostic(userId, { starterId: 'starter', fullMode: true, floor: 1, seed: `full-diagnostic-${hidden}`, hidden: false, relicIds: [] }, configured, productionType());
  assert.equal(run.floor, 1); assert.equal(run.fullModeTest, true);
  let dialogues = 0;
  for (let battleIndex = 0; battleIndex < (hidden ? 17 : 16); battleIndex++) {
    assert.equal(run.phase, 'HUB'); assert.equal(run.deck.length, 25);
    let started = await store.applyTowerCommand(userId, run.id, run.version, { type: 'CHALLENGE' }, productionType());
    if (started.run.encounter.bossSlot) {
      dialogues++;
      assert.equal(started.run.phase, 'DIALOGUE'); assert.notEqual(started.battle?.status, 'IN_PROGRESS');
      assert.equal(started.run.encounter.sceneId, 'full-story');
      started = await store.applyTowerCommand(userId, run.id, started.run.version, { type: 'DIALOGUE_NEXT' }, productionType());
      assert.equal(started.run.phase, 'DIALOGUE'); assert.equal(started.run.dialogueIndex, 1);
      started = await store.applyTowerCommand(userId, run.id, started.run.version, { type: 'DIALOGUE_NEXT' }, productionType());
    }
    assert.equal(started.run.phase, 'BATTLE'); assert.ok(started.battle);
    run = (await store.saveTowerBattle(userId, run.id, started.run.version, win(started.battle), productionType())).run;
    if (run.phase === 'CARD_REWARD') run = (await store.applyTowerCommand(userId, run.id, run.version, { type: 'SKIP_CARD' }, productionType())).run;
    else if (run.phase === 'RELIC_REWARD') {
      const relicId = run.relicOptions.find(id => !['MAX_FIELD_ONE', 'MAX_FIELD_TWO', 'FIRST_SUMMON_COST_DOWN_NO_ATTACK'].includes(id)) ?? run.relicOptions[0]!;
      run = (await store.applyTowerCommand(userId, run.id, run.version, { type: 'SELECT_RELIC', relicId }, productionType())).run;
    }
  }
  assert.equal(dialogues, hidden ? 5 : 4);
  assert.equal(run.phase, 'RESULT'); assert.equal(run.regularClear, true); assert.equal(run.hiddenClear, hidden);
  assert.equal(run.defeatedBossSlots.includes('hiddenBoss'), hidden); assert.equal(run.relicIds.length, 3);
  assert.equal((await database.select().from(schema.rewardGrantsTable).where(eq(schema.rewardGrantsTable.userId, userId))).length, 0);
  assert.equal((await database.select().from(schema.towerBossClearsTable).where(eq(schema.towerBossClearsTable.userId, userId))).length, 0);
  assert.equal((await database.select().from(schema.towerBossReceiptsTable).where(eq(schema.towerBossReceiptsTable.runId, run.id))).length, 0);
  assert.equal((await database.select().from(schema.towerUnlocksTable).where(eq(schema.towerUnlocksTable.userId, userId))).length, 0);
  assert.deepEqual((await database.select().from(schema.towerRunsTable).where(eq(schema.towerRunsTable.id, original.id)))[0]!.state, original);
});

test('draft card and champion rewards grant ownership once and become valid player deck references',async()=>{
 const rewards=await import('../../../artifacts/api-server/src/lib/reward-service');
 await database.insert(schema.usersTable).values({id:'draft-owner',email:'draft-owner@example.invalid',nickname:'draft-owner',passwordHash:'none'});
 await database.insert(schema.championsTable).values({id:'draft-reward-champ',name:'Secret Champion',abilityName:'None',abilityEffects:{},status:'DRAFT',maxHealth:30});
 await database.insert(schema.cardsTable).values({id:'draft-reward-card',name:'Secret Card',cardType:'WRESTLER',cost:1,attack:1,health:1,text:'',status:'DRAFT'});
 const executor=productionType();
 assert.equal(await rewards.validateRewardTarget('CARD','draft-reward-card',executor),true);
 assert.equal(await rewards.validateRewardTarget('CHAMPION','draft-reward-champ',executor),true);
 for(const rewardType of ['CARD','CHAMPION']){
  const grant={userId:'draft-owner',sourceType:'QA_QUEST',sourceId:'draft',rewardType,rewardTargetId:rewardType==='CARD'?'draft-reward-card':'draft-reward-champ',amount:1};
  const first=await database.transaction(tx=>rewards.grantReward(grant,tx as unknown as typeof executor));
  const duplicate=await database.transaction(tx=>rewards.grantReward(grant,tx as unknown as typeof executor));
  assert.equal(first.granted,true);assert.equal(duplicate.granted,false);
 }
 const [card]=await database.select().from(schema.userCardCollectionsTable).where(eq(schema.userCardCollectionsTable.userId,'draft-owner'));assert.equal(card.quantity,1);
 const [champ]=await database.select().from(schema.userChampionCollectionsTable).where(eq(schema.userChampionCollectionsTable.userId,'draft-owner'));assert.equal(champ.owned,true);
});

test('new Tower boss encounters use the available AI match deck pool',()=>{
 for(const boss of Object.values(snapshot.catalog.season.bosses)) assert.equal(boss.presetId,'ai-deck:qa-boss');
 const aiPreset=snapshot.catalog.presets.find(p=>p.id==='ai-deck:qa-boss')!;
 assert.deepEqual(aiPreset.acts,[]);assert.equal(aiPreset.championId,'enemy');assert.equal(aiPreset.weight,0);
});

test('player deck validation allows owned drafts, rejects unowned drafts and enforces owned copies; admin bypasses ownership',async()=>{
 const {resolveDeck}=await import('../../../artifacts/api-server/src/routes/decks');
 const publicCards=Array.from({length:24},(_,i)=>`qa-card-${i%12}`);
 await database.insert(schema.userCardCollectionsTable).values(Array.from({length:12},(_,i)=>({userId:'draft-owner',cardDefinitionId:`qa-card-${i}`,quantity:2})));
 const [deck]=await database.insert(schema.decksTable).values({id:'owned-draft-deck',userId:'draft-owner',name:'Owned secrets',championDefinitionId:'draft-reward-champ',cardDefinitionIds:['draft-reward-card',...publicCards]}).returning();
 assert.equal((await resolveDeck(deck,'draft-owner',false,productionType())).isValid,true);
 const overCopies=await resolveDeck({...deck,cardDefinitionIds:['draft-reward-card','draft-reward-card',...publicCards.slice(0,23)]},'draft-owner',false,productionType());
 assert.equal(overCopies.isValid,false);assert.ok(overCopies.validationReasons.some(r=>r.reasonCode==='CARD_QUANTITY_EXCEEDED'));
 await database.insert(schema.usersTable).values({id:'unowned-draft',email:'unowned-draft@example.invalid',nickname:'outsider',passwordHash:'none'});
 const unowned=await resolveDeck(deck,'unowned-draft',false,productionType());assert.equal(unowned.isValid,false);assert.ok(unowned.validationReasons.some(r=>r.reasonCode==='CHAMPION_NOT_OWNED'));assert.ok(unowned.validationReasons.some(r=>r.reasonCode==='CARD_NOT_OWNED'));
 await database.update(schema.usersTable).set({role:'ADMIN'}).where(eq(schema.usersTable.id,'unowned-draft'));
 assert.equal((await resolveDeck(deck,'unowned-draft',false,productionType())).isValid,true);
});
