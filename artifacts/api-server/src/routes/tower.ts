import { Router, type IRouter } from 'express';
import { and, eq, desc } from 'drizzle-orm';
import { db, towerSettingsTable, towerSeasonsTable, towerVersionsTable, towerRunsTable, towerBossReceiptsTable, userChampionCollectionsTable } from '@workspace/db';
import { TowerRuleError, parseRunCommand, type GameState, type TowerRun, type TowerSnapshot, newTowerRun } from '@workspace/game-engine';
import { getAuthenticatedUser } from '../lib/auth';
import { loadTowerSnapshot } from '../lib/tower-catalog';
import { applyTowerCommand, createPersistedTowerRun, restartTowerBattle, towerHistory } from '../lib/tower-run-store';
import { executeTowerPlayerAction } from '../lib/tower-battle-actions';
import { sanitizeGameStateForViewer } from '../online/sanitizer';

const router: IRouter = Router();
const publicRun = (run: TowerRun) => {
  const { seed: _seed, encounter, ...visible } = run;
  const { seed: _battleSeed, cardIds:_enemyDeck, ...enemy } = encounter;
  return { ...visible, encounter: enemy };
};
const receipts = (id: string) => db.select({ slot: towerBossReceiptsTable.bossSlotId, firstClear: towerBossReceiptsTable.firstClear, reward: towerBossReceiptsTable.reward }).from(towerBossReceiptsTable).where(eq(towerBossReceiptsTable.runId, id));
const view = (run: TowerRun, battle: GameState | null) => ({ run: publicRun(run), battle: battle ? sanitizeGameStateForViewer(battle, 'player-1') : null });
function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new TowerRuleError('INVALID_VERSION', '진행 버전을 확인해 주세요.');
  return value;
}
router.get('/availability', async (_request, response, next) => {
  try {
    const [settings] = await db.select().from(towerSettingsTable).where(eq(towerSettingsTable.id, 'global'));
    response.setHeader('Cache-Control', 'no-store'); response.json({ enabled: settings?.enabled === true });
  } catch (error) {
    // A production DB without the additive migration must preserve the existing game.
    if ((error as { cause?: { code?: string }; code?: string }).code === '42P01' || (error as { cause?: { code?: string } }).cause?.code === '42P01') response.json({ enabled: false });
    else next(error);
  }
});
router.use(async (request, response, next) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) { response.status(401).json({ message: '로그인이 필요합니다.' }); return; }
    request.authUser = user;
    const [settings] = await db.select().from(towerSettingsTable).where(eq(towerSettingsTable.id, 'global'));
    if (!settings?.enabled) { response.status(503).json({ code: 'TOWER_DISABLED', message: '타워 모드는 현재 사용할 수 없습니다.' }); return; }
    next();
  } catch (error) { next(error); }
});
router.get('/towers',async(_request,response,next)=>{try{
 const definitions=await db.select().from(towerSeasonsTable),versions=await db.select().from(towerVersionsTable).orderBy(desc(towerVersionsTable.version));
 const towers=definitions.flatMap(d=>{const draft=d.data.v2 as TowerSnapshot["catalog"]["season"]["v2"];const published=versions.find(v=>v.towerId===d.id);if(draft&&(!draft.enabled||!draft.visible||!published))return [];if(!draft&&!d.active)return [];const season:TowerSnapshot["catalog"]["season"]=published?(published.snapshot as unknown as TowerSnapshot).catalog.season:({...d.data,id:d.id,name:d.name} as TowerSnapshot["catalog"]["season"]);const v=season.v2;return [{id:d.id,name:season.name,description:season.description,totalFloors:v?.floors.length??16,imageUrl:v?.selectionImageUrl??v?.imageUrl,recommendedDifficulty:v?.recommendedDifficulty,sortOrder:draft?.sortOrder??0}];}).sort((a,b)=>a.sortOrder-b.sortOrder);
 response.json({towers});
}catch(e){next(e);}});
router.get('/home', async (request, response, next) => {
  try {
    const snapshot = await loadTowerSnapshot(db,typeof request.query.towerId==='string'?request.query.towerId:undefined);
    const userId = request.authUser!.id;
    const ownership = await db.select().from(userChampionCollectionsTable).where(and(eq(userChampionCollectionsTable.userId, userId), eq(userChampionCollectionsTable.owned, true)));
    const ownedIds = ownership.map(row => row.championDefinitionId);
    const history = await db.transaction(tx => towerHistory(tx, userId, snapshot.catalog.season.id));
    const starters = snapshot.catalog.starters.filter(starter => {
      if ((!snapshot.catalog.season.v2&&!ownedIds.includes(starter.championId)) || !ownedIds.length || !starter.enabled) return false;
      try { newTowerRun({ id: 'preview', seed: 'preview', championId: snapshot.catalog.season.v2?ownedIds[0]!:starter.championId, starterId: starter.id, ownedChampionIds: ownedIds }, snapshot.catalog, history); return true; }
      catch { return false; }
    });
    response.setHeader('Cache-Control', 'no-store');
    response.json({ season: { id: snapshot.catalog.season.id, name: snapshot.catalog.season.name, description: snapshot.catalog.season.description, totalFloors:snapshot.catalog.season.v2?.floors.length??16, v2:Boolean(snapshot.catalog.season.v2) },
      champions: snapshot.champions.filter(c => ownedIds.includes(c.id)), starters, cards: snapshot.cards.filter(c => c.status !== 'DISABLED') });
  } catch (error) { next(error); }
});
router.post('/runs', async (request, response, next) => {
  try {
    const { championId, starterId, towerId } = request.body ?? {};
    if (typeof championId !== 'string' || typeof starterId !== 'string') throw new TowerRuleError('INVALID_CONFIG', '챔피언과 스타터 덱을 선택해 주세요.');
    const run = await createPersistedTowerRun(request.authUser!.id, championId, starterId, await loadTowerSnapshot(db,typeof towerId==='string'?towerId:undefined));
    response.status(201).json(view(run, null));
  } catch (error) { next(error); }
});
router.get('/runs/current', async (request, response, next) => {
  try {
    const [row] = await db.select().from(towerRunsTable).where(and(eq(towerRunsTable.userId, request.authUser!.id), eq(towerRunsTable.ended, false), eq(towerRunsTable.isTest, false)));
    if (!row) { response.json({ run: null }); return; }
    const snapshot = row.snapshot as unknown as TowerSnapshot;
    response.setHeader('Cache-Control', 'no-store');
    response.json({ ...view(row.state as unknown as TowerRun, row.currentBattle as unknown as GameState | null),
      cards: snapshot.cards.filter(c => c.status !== 'DISABLED'), champions: snapshot.champions, relics: snapshot.catalog.relics, scenes: snapshot.catalog.scenes, characters: snapshot.catalog.characters, music: snapshot.catalog.season.music, rewardReceipts: await receipts(row.id) });
  } catch (error) { next(error); }
});
router.get('/runs/:id', async (request, response, next) => {
  try {
    const [row] = await db.select().from(towerRunsTable).where(and(eq(towerRunsTable.id, String(request.params.id)), eq(towerRunsTable.userId, request.authUser!.id), eq(towerRunsTable.isTest, false)));
    if (!row) throw new TowerRuleError('RUN_NOT_FOUND', '타워 도전을 찾을 수 없습니다.');
    const snapshot = row.snapshot as unknown as TowerSnapshot;
    const run = row.state as unknown as TowerRun;
    response.setHeader('Cache-Control', 'no-store');
    response.json({ ...view({ ...run, ended: row.ended, ...(row.ended ? { phase: 'RESULT' as const } : {}) }, row.currentBattle as unknown as GameState | null),
      cards: snapshot.cards.filter(c => c.status !== 'DISABLED'), champions: snapshot.champions, relics: snapshot.catalog.relics,
      scenes: snapshot.catalog.scenes, characters: snapshot.catalog.characters, music: snapshot.catalog.season.music, rewardReceipts: await receipts(row.id) });
  } catch (error) { next(error); }
});
for (const operation of ['command', 'action', 'restart'] as const) router.post(`/runs/:id/${operation}`, async (request, response, next) => {
  try {
    const userId = request.authUser!.id; const id = String(request.params.id); const expected = version(request.body?.version);
    const result = operation === 'command' ? await applyTowerCommand(userId, id, expected, parseRunCommand(request.body?.command))
      : operation === 'action' ? await executeTowerPlayerAction(userId, id, expected, request.body?.action) : await restartTowerBattle(userId, id, expected);
    response.json({ ...view(result.run, result.battle), rewardReceipts: await receipts(result.run.id) });
  } catch (error) { next(error); }
});
router.use((error: unknown, _request: import('express').Request, response: import('express').Response, next: import('express').NextFunction) => {
  if (!(error instanceof TowerRuleError)) { next(error); return; }
  console.warn('[tower]', error.code, error.message);
  response.status(error.code === 'STALE_RUN' ? 409 : error.code === 'RUN_NOT_FOUND' ? 404 : 422).json({ code: error.code, message: error.message });
});
export default router;
