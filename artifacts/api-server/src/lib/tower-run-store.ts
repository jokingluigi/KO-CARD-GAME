import { processMatchEventsForDailyQuests } from "./daily-quest-service";
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db, towerRunsTable, towerBossClearsTable, towerBossReceiptsTable, towerSettingsTable, towerUnlocksTable, userChampionCollectionsTable } from '@workspace/db';
import { TowerRuleError, newTowerRun, transitionRun, createTowerBattle, type TowerRun, type TowerSnapshot, encounterFor, validateTowerDeck, conditionMatches, type History, type RunCommand, type GameState } from '@workspace/game-engine';
import { grantReward } from './reward-service';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RunRow = typeof towerRunsTable.$inferSelect;
const json = (value: object) => value as unknown as Record<string, unknown>;
const decode = (row: RunRow) => ({ run: row.state as unknown as TowerRun, snapshot: row.snapshot as unknown as TowerSnapshot });

export async function createPersistedTowerRun(userId: string, championId: string, starterId: string, snapshot: TowerSnapshot, database: typeof db = db) {
  return database.transaction(async tx => {
    await lockUser(tx, userId);
    const [settings] = await tx.select().from(towerSettingsTable).where(eq(towerSettingsTable.id, 'global'));
    if (!settings?.enabled) throw new TowerRuleError('TOWER_DISABLED', '타워 모드는 현재 사용할 수 없습니다.');
    const [existing] = await tx.select({ id: towerRunsTable.id }).from(towerRunsTable).where(and(eq(towerRunsTable.userId, userId), eq(towerRunsTable.ended, false), eq(towerRunsTable.isTest, false)));
    if (existing) throw new TowerRuleError('RUN_EXISTS', '진행 중인 도전을 이어 하거나 종료해 주세요.');
    const ownership = await tx.select({ id: userChampionCollectionsTable.championDefinitionId }).from(userChampionCollectionsTable)
      .where(and(eq(userChampionCollectionsTable.userId, userId), eq(userChampionCollectionsTable.owned, true)));
    const run = newTowerRun({ id: randomUUID(), seed: randomUUID(), championId, starterId, ownedChampionIds: ownership.map(row => row.id) },
      snapshot.catalog, await towerHistory(tx, userId, snapshot.catalog.season.id));
    await tx.insert(towerRunsTable).values({ id: run.id, userId, seasonId: run.seasonId, state: json(run), snapshot: json(snapshot) });
    return run;
  });
}

/** Serialize all first-clear/reward decisions for one account in the same transaction. */
async function lockUser(tx: Transaction, userId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'tower:' + userId}))`);
}
async function lockedRun(tx: Transaction, userId: string, runId: string, version: number) {
  await lockUser(tx, userId);
  const [row] = await tx.select().from(towerRunsTable).where(and(eq(towerRunsTable.id, runId), eq(towerRunsTable.userId, userId))).for('update');
  if (!row) throw new TowerRuleError('RUN_NOT_FOUND', '타워 도전을 찾을 수 없습니다.');
  if (row.ended) throw new TowerRuleError('RUN_ENDED', '이미 종료된 타워 도전입니다.');
  if (row.version !== version) throw new TowerRuleError('STALE_RUN', '진행 상태가 변경됐습니다. 다시 불러와 주세요.');
  return row;
}
export async function towerHistory(tx: Transaction, userId: string, seasonId: string): Promise<History> {
  const runs = await tx.select({ state: towerRunsTable.state }).from(towerRunsTable).where(and(eq(towerRunsTable.userId, userId), eq(towerRunsTable.seasonId, seasonId), eq(towerRunsTable.isTest, false)));
  const clears = await tx.select({ slot: towerBossClearsTable.bossSlotId }).from(towerBossClearsTable).where(and(eq(towerBossClearsTable.userId, userId), eq(towerBossClearsTable.seasonId, seasonId)));
  const unlocks = await tx.select().from(towerUnlocksTable).where(eq(towerUnlocksTable.userId, userId));
  const completed = runs.filter(row => row.state.regularClear === true);
  return { clearCount: completed.length, normalEnding: completed.length > 0, bossSlots: clears.map(row => row.slot), unlockedRelicIds: unlocks.filter(r => r.kind === 'RELIC').map(r => r.targetId), unlockedStarterIds: unlocks.filter(r => r.kind === 'STARTER').map(r => r.targetId) };
}
async function runHistory(tx: Transaction, userId: string, run: TowerRun, snapshot: TowerSnapshot): Promise<History> {
  if (!run.isTest || run.fullModeTest) return towerHistory(tx, userId, run.seasonId);
  return { clearCount: 0, normalEnding: false, bossSlots: [], unlockedRelicIds: snapshot.catalog.relics.map(r => r.id), unlockedStarterIds: snapshot.catalog.starters.map(s => s.id) };
}
async function saveRun(tx: Transaction, row: RunRow, run: TowerRun, battle: GameState | null, initial: GameState | null = null) {
  await tx.update(towerRunsTable).set({ state: json(run), version: run.version, ended: run.ended, currentBattle: battle ? json(battle) : null,
    initialBattle: initial ? json(initial) : row.initialBattle, updatedAt: new Date() }).where(eq(towerRunsTable.id, row.id));
  if (!run.isTest) {
    const { snapshot } = decode(row);
    const history = await towerHistory(tx, row.userId, run.seasonId);
    for (const [kind, items] of [['RELIC', snapshot.catalog.relics], ['STARTER', snapshot.catalog.starters]] as const) {
      const earned = new Set(kind === 'RELIC' ? history.unlockedRelicIds : history.unlockedStarterIds);
      for (const item of items) if (!earned.has(item.id) && item.enabled && item.unlockCondition && conditionMatches(item.unlockCondition, run, snapshot.catalog, history)) {
        await tx.insert(towerUnlocksTable).values({ id: randomUUID(), userId: row.userId, kind, targetId: item.id, sourceRunId: run.id }).onConflictDoNothing();
      }
    }
  }
  return { run, battle };
}

/** Client cannot submit a victory: only engine-derived settlement calls this store. */
export async function applyTowerCommand(userId: string, runId: string, expectedVersion: number, command: Exclude<RunCommand, { type: 'BATTLE_RESULT' }>, database: typeof db = db) {
  return database.transaction(async tx => {
    const row = await lockedRun(tx, userId, runId, expectedVersion);
    const { run, snapshot } = decode(row);
    const next = transitionRun(run, command, snapshot.catalog, await runHistory(tx, userId, run, snapshot), expectedVersion);
    const starting = next.phase === 'BATTLE' && run.phase !== 'BATTLE';
    const battle = starting ? createTowerBattle(next, snapshot) : row.currentBattle as unknown as GameState | null;
    return saveRun(tx, row, next, battle, starting ? battle : null);
  });
}

async function settleBoss(tx: Transaction, row: RunRow, run: TowerRun, snapshot: TowerSnapshot) {
  const slot = run.encounter.bossSlot;
  if (!slot || run.isTest) return;
  const [receipt] = await tx.select().from(towerBossReceiptsTable).where(and(eq(towerBossReceiptsTable.runId, run.id), eq(towerBossReceiptsTable.bossSlotId, slot)));
  if (receipt) return;
  const [first] = await tx.insert(towerBossClearsTable).values({ id: randomUUID(), userId: row.userId, seasonId: run.seasonId, bossSlotId: slot, firstRunId: run.id })
    .onConflictDoNothing().returning({ id: towerBossClearsTable.id });
  const boss = snapshot.catalog.season.bosses[slot];
  if (!boss) throw new TowerRuleError('INVALID_BOSS', '보스 보상 설정을 찾을 수 없습니다.');
  const reward = first ? boss.firstReward : boss.repeatReward;
  const grant = await grantReward({ userId: row.userId, sourceType: 'TOWER_BOSS', sourceId: `${run.id}:${slot}`, rewardType: reward.type,
    rewardTargetId: reward.targetId, amount: reward.amount, metadata: { seasonId: run.seasonId, bossSlotId: slot, firstClear: Boolean(first) } }, tx);
  await tx.insert(towerBossReceiptsTable).values({ id: randomUUID(), runId: run.id, bossSlotId: slot, firstClear: Boolean(first), reward: json({ ...reward, grant }) });
}

/** Called with a state produced server-side by executeAction; never expose as a result API. */
export async function saveTowerBattle(userId: string, runId: string, expectedVersion: number, battle: GameState, database: typeof db = db) {
  return database.transaction(async tx => {
    const row = await lockedRun(tx, userId, runId, expectedVersion);
    const { run, snapshot } = decode(row);
    if (run.phase !== 'BATTLE') throw new TowerRuleError('INVALID_PHASE', '진행 중인 전투가 없습니다.');
    if (battle.gameId !== (row.initialBattle as unknown as GameState | null)?.gameId) throw new TowerRuleError('INVALID_BATTLE', '전투가 일치하지 않습니다.');
    if (!run.isTest) await processMatchEventsForDailyQuests(userId, 'player-1', battle.gameId, battle, (row.currentBattle as unknown as GameState | null)?.events.length ?? 0, tx, undefined, 'TOWER');
    if (battle.status !== 'FINISHED') return saveRun(tx, row, { ...run, version: run.version + 1 }, battle);
    const won = battle.winnerId === 'player-1';
    if (won) await settleBoss(tx, row, run, snapshot);
    const next = transitionRun(run, { type: 'BATTLE_RESULT', won }, snapshot.catalog, await runHistory(tx, userId, run, snapshot), expectedVersion);
    return saveRun(tx, row, next, battle);
  });
}

export async function restartTowerBattle(userId: string, runId: string, expectedVersion: number, database: typeof db = db) {
  return database.transaction(async tx => {
    const row = await lockedRun(tx, userId, runId, expectedVersion);
    const { run } = decode(row);
    if (run.phase !== 'BATTLE' || !row.initialBattle) throw new TowerRuleError('INVALID_PHASE', '재개할 전투가 없습니다.');
    return saveRun(tx, row, { ...run, version: run.version + 1 }, structuredClone(row.initialBattle) as unknown as GameState);
  });
}

/** Close atomically with the same account lock used by battle and reward writes. */
export async function closeTowerRun(runId: string, database: typeof db = db) {
  return database.transaction(async tx => {
    const [owner] = await tx.select({ userId: towerRunsTable.userId }).from(towerRunsTable).where(eq(towerRunsTable.id, runId));
    if (!owner) throw new TowerRuleError('RUN_NOT_FOUND', '도전을 찾을 수 없습니다.');
    await lockUser(tx, owner.userId);
    const [row] = await tx.select().from(towerRunsTable).where(eq(towerRunsTable.id, runId)).for('update');
    if (row.ended) return;
    const { run } = decode(row);
    const closed: TowerRun = { ...run, ended: true, phase: 'RESULT', version: run.version + 1 };
    await saveRun(tx, row, closed, null);
  });
}

/** Administrator diagnostics are separate rows and never enter account progress or grant rewards. */
export async function createTowerDiagnostic(userId: string, input: { starterId: string; seed: string; floor: number; fullMode?: boolean; hidden?: boolean; relicIds: string[]; deck?: string[]; presetId?: string }, snapshot: TowerSnapshot, database: typeof db = db) {
  if (!Number.isInteger(input.floor) || input.floor < 1 || input.floor > 16 || !input.seed || input.seed.length > 200 || new Set(input.relicIds).size !== input.relicIds.length || input.relicIds.length > 3)
    throw new TowerRuleError('INVALID_CONFIG', '테스트 층·Seed·유물 선택을 확인해 주세요.');
  if (input.fullMode && (input.floor !== 1 || input.hidden || input.relicIds.length || input.deck || input.presetId)) throw new TowerRuleError('INVALID_CONFIG', '전체 모드 테스트는 기본 스타터 덱으로 1층부터 진행합니다.');
  const starter = snapshot.catalog.starters.find(item => item.id === input.starterId);
  if (!starter) throw new TowerRuleError('INVALID_STARTER', '스타터 덱을 선택해 주세요.');
  for (const id of input.relicIds) if (!snapshot.catalog.relics.some(item => item.id === id && item.enabled)) throw new TowerRuleError('INVALID_RELIC_OPTION', '활성 유물을 선택해 주세요.');
  const history: History = input.fullMode ? await database.transaction(tx => towerHistory(tx, userId, snapshot.catalog.season.id)) : { clearCount: 0, normalEnding: false, bossSlots: [], unlockedRelicIds: snapshot.catalog.relics.map(r => r.id), unlockedStarterIds: [starter.id] };
  // The chosen starter is available for QA; subsequent relic and hidden-boss conditions use normal account history.
  history.unlockedStarterIds = [...new Set([...history.unlockedStarterIds, starter.id])];
  let run = newTowerRun({ id: randomUUID(), seed: input.seed, championId: starter.championId, starterId: starter.id, ownedChampionIds: [starter.championId], isTest: true }, snapshot.catalog, history);
  run = { ...run, ...(input.fullMode ? { fullModeTest: true } : {}), floor: input.hidden ? 16 : input.floor, relicIds: [...input.relicIds], deck: input.deck ? [...input.deck] : run.deck };
  validateTowerDeck(run.deck, snapshot.catalog);
  run.encounter = encounterFor(run, snapshot.catalog, input.hidden === true);
  if (input.presetId) {
    const preset = snapshot.catalog.presets.find(p => p.id === input.presetId && p.enabled);
    if (!preset) throw new TowerRuleError('INVALID_PRESET', '활성 상대 덱을 선택해 주세요.');
    run.encounter = { ...run.encounter, presetId: preset.id, difficulty: preset.difficulty };
  }
  await database.transaction(async tx => {
    await lockUser(tx, userId);
    await tx.insert(towerRunsTable).values({ id: run.id, userId, seasonId: run.seasonId, isTest: true, state: json(run), snapshot: json(snapshot) });
  });
  return run;
}
