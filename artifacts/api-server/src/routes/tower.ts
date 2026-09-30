import { Router, type IRouter } from 'express';
import { and, eq } from 'drizzle-orm';
import { db, towerSettingsTable, towerRunsTable } from '@workspace/db';
import { TowerRuleError, parseRunCommand, type GameState, type TowerRun, type TowerSnapshot } from '@workspace/game-engine';
import { getAuthenticatedUser } from '../lib/auth';
import { loadTowerSnapshot } from '../lib/tower-catalog';
import { applyTowerCommand, createPersistedTowerRun, restartTowerBattle } from '../lib/tower-run-store';
import { executeTowerPlayerAction } from '../lib/tower-battle-actions';
import { sanitizeGameStateForViewer } from '../online/sanitizer';

const router: IRouter = Router();
const publicRun = (run: TowerRun) => {
  const { seed: _seed, encounter, ...visible } = run;
  const { seed: _battleSeed, ...enemy } = encounter;
  return { ...visible, encounter: enemy };
};
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
router.post('/runs', async (request, response, next) => {
  try {
    const { championId, starterId } = request.body ?? {};
    if (typeof championId !== 'string' || typeof starterId !== 'string') throw new TowerRuleError('INVALID_CONFIG', '챔피언과 스타터 덱을 선택해 주세요.');
    const run = await createPersistedTowerRun(request.authUser!.id, championId, starterId, await loadTowerSnapshot());
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
      cards: snapshot.cards, champions: snapshot.champions, relics: snapshot.catalog.relics, scenes: snapshot.catalog.scenes, characters: snapshot.catalog.characters });
  } catch (error) { next(error); }
});
for (const operation of ['command', 'action', 'restart'] as const) router.post(`/runs/:id/${operation}`, async (request, response, next) => {
  try {
    const userId = request.authUser!.id; const id = String(request.params.id); const expected = version(request.body?.version);
    const result = operation === 'command' ? await applyTowerCommand(userId, id, expected, parseRunCommand(request.body?.command))
      : operation === 'action' ? await executeTowerPlayerAction(userId, id, expected, request.body?.action) : await restartTowerBattle(userId, id, expected);
    response.json(view(result.run, result.battle));
  } catch (error) { next(error); }
});
router.use((error: unknown, _request: import('express').Request, response: import('express').Response, next: import('express').NextFunction) => {
  if (!(error instanceof TowerRuleError)) { next(error); return; }
  response.status(error.code === 'STALE_RUN' ? 409 : error.code === 'RUN_NOT_FOUND' ? 404 : 422).json({ code: error.code, message: error.message });
});
export default router;
