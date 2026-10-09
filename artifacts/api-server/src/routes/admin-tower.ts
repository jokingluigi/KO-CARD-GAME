import {randomUUID} from 'node:crypto';
import { sanitizeGameStateForViewer } from '../online/sanitizer';
import { executeTowerPlayerAction } from '../lib/tower-battle-actions';
import { Router, type IRouter } from 'express';
import { desc, eq, sql } from 'drizzle-orm';
import { db, towerSettingsTable, towerSeasonsTable, towerStartersTable, towerPresetsTable, towerRelicsTable, towerCharactersTable, towerScenesTable, towerMetadataTable, towerRunsTable, towerVersionsTable } from '@workspace/db';
import { TowerRuleError, parseSeason, parseStarter, parsePreset, parseRelic, parseCharacter, parseScene, parseMetadata, TOWER_RELIC_DEFINITIONS, TOWER_EFFECT_LIBRARY, parseRunCommand, type TowerRun, type TowerSnapshot, type GameState } from '@workspace/game-engine';
import { getAuthenticatedUser } from '../lib/auth';
import { loadTowerSnapshot } from '../lib/tower-catalog';
import { closeTowerRun, createTowerDiagnostic, applyTowerCommand, restartTowerBattle } from '../lib/tower-run-store';

const router: IRouter = Router();
const tables = { starters: towerStartersTable, presets: towerPresetsTable, relics: towerRelicsTable, characters: towerCharactersTable, scenes: towerScenesTable };
const parsers = { starters: parseStarter, presets: parsePreset, relics: parseRelic, characters: parseCharacter, scenes: parseScene };
router.use(async (request, response, next) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user || user.role !== 'ADMIN') { response.status(user ? 403 : 401).json({ message: '관리자 권한이 필요합니다.' }); return; }
    request.authUser = user; next();
  } catch (error) { next(error); }
});
// Diagnostic endpoints use the same authoritative engine and persistence as player runs.
router.get('/test/availability', (_request, response) => response.json({ enabled: true }));
router.get('/test/home', async (_request, response, next) => {
  try { const snapshot = await loadTowerSnapshot(); response.json({ season: snapshot.catalog.season, champions: snapshot.champions, starters: snapshot.catalog.starters.filter(s => s.enabled), cards: snapshot.cards.filter(c => c.status !== 'DISABLED') }); }
  catch (error) { next(error); }
});
function diagnosticView(run: TowerRun, battle: GameState | null, snapshot?: TowerSnapshot) {
  const { seed, encounter, ...visible } = run; const { seed: battleSeed, ...enemy } = encounter;
  return { run: { ...visible, encounter: enemy }, battle: battle ? sanitizeGameStateForViewer(battle, 'player-1') : null,
    ...(snapshot ? { cards: snapshot.cards.filter(c => c.status === 'PUBLISHED'), champions: snapshot.champions, relics: snapshot.catalog.relics, scenes: snapshot.catalog.scenes, characters: snapshot.catalog.characters, music: snapshot.catalog.season.music,
      rewardPreview: run.encounter.bossSlot ? snapshot.catalog.season.v2?.bosses.find(b=>b.id===(run.encounter.bossSlot==='hiddenBoss'?snapshot.catalog.season.v2?.hiddenBossId:run.encounter.bossSlot)) ?? snapshot.catalog.season.bosses[run.encounter.bossSlot] : null } : {}) };
}
router.post('/test/runs', async (request, response, next) => {
  try {
    const input = request.body;
    if (typeof input?.starterId !== 'string' || typeof input.seed !== 'string' || !Array.isArray(input.relicIds) || !input.relicIds.every((id: unknown) => typeof id === 'string') || (input.fullMode !== undefined && typeof input.fullMode !== 'boolean') || (input.hidden !== undefined && typeof input.hidden !== 'boolean') || (input.deck !== undefined && (!Array.isArray(input.deck) || !input.deck.every((id: unknown) => typeof id === 'string'))) || (input.presetId !== undefined && typeof input.presetId !== 'string')) throw new TowerRuleError('INVALID_CONFIG', '테스트 설정을 확인해 주세요.');
    const snapshot = await loadTowerSnapshot(db,typeof input.towerId==='string'?input.towerId:undefined,true); const run = await createTowerDiagnostic(request.authUser!.id, input, snapshot);
    response.status(201).json(diagnosticView(run, null, snapshot));
  } catch (error) { next(error); }
});
router.get('/test/runs/:id', async (request, response, next) => {
  try {
    const [row] = await db.select().from(towerRunsTable).where(eq(towerRunsTable.id, String(request.params.id)));
    if (!row || !row.isTest || row.userId !== request.authUser!.id) throw new TowerRuleError('RUN_NOT_FOUND', '테스트 도전을 찾을 수 없습니다.');
    response.json(diagnosticView(row.state as unknown as TowerRun, row.currentBattle as unknown as GameState | null, row.snapshot as unknown as TowerSnapshot));
  } catch (error) { next(error); }
});
for (const operation of ['command', 'action', 'restart'] as const) router.post(`/test/runs/:id/${operation}`, async (request, response, next) => {
  try {
    const id = String(request.params.id); const userId = request.authUser!.id; const version = request.body?.version;
    const [row] = await db.select().from(towerRunsTable).where(eq(towerRunsTable.id, id));
    if (!row || !row.isTest || row.userId !== userId) throw new TowerRuleError('RUN_NOT_FOUND', '테스트 도전을 찾을 수 없습니다.');
    if (!Number.isSafeInteger(version) || version < 0) throw new TowerRuleError('INVALID_VERSION', '진행 버전을 확인해 주세요.');
    const result = operation === 'command' ? await applyTowerCommand(userId, id, version, parseRunCommand(request.body?.command)) : operation === 'action' ? await executeTowerPlayerAction(userId, id, version, request.body?.action) : await restartTowerBattle(userId, id, version);
    response.json(diagnosticView(result.run, result.battle, row.snapshot as unknown as TowerSnapshot));
  } catch (error) { next(error); }
});
router.get('/', async (_request, response, next) => {
  try {
    const [settings, seasons, starters, presets, relics, characters, scenes, metadata] = await Promise.all([
      db.select().from(towerSettingsTable), db.select().from(towerSeasonsTable), db.select().from(towerStartersTable), db.select().from(towerPresetsTable),
      db.select().from(towerRelicsTable), db.select().from(towerCharactersTable), db.select().from(towerScenesTable), db.select().from(towerMetadataTable),
    ]);
    response.setHeader('Cache-Control', 'no-store');
    response.json({ enabled: settings.some(s => s.id === 'global' && s.enabled), seasons, starters, presets, relics, characters, scenes, metadata, effectLibrary:TOWER_EFFECT_LIBRARY, relicDefinitions: TOWER_RELIC_DEFINITIONS });
  } catch (error) { next(error); }
});
router.put('/settings', async (request, response, next) => {
  try {
    if (typeof request.body?.enabled !== 'boolean') throw new TowerRuleError('INVALID_CONFIG', '사용 여부를 확인해 주세요.');
    if (request.body.enabled) {const published=await db.select().from(towerVersionsTable).orderBy(desc(towerVersionsTable.createdAt));const definitions=await db.select().from(towerSeasonsTable);const available=published.find(v=>definitions.some(d=>d.id===v.towerId&&(d.data.v2 as TowerSnapshot["catalog"]["season"]["v2"])?.enabled&&(d.data.v2 as TowerSnapshot["catalog"]["season"]["v2"])?.visible));await loadTowerSnapshot(db,available?.towerId);}
    await db.insert(towerSettingsTable).values({ id: 'global', enabled: request.body.enabled }).onConflictDoUpdate({ target: towerSettingsTable.id, set: { enabled: request.body.enabled, updatedAt: new Date() } });
    response.json({ enabled: request.body.enabled });
  } catch (error) { next(error); }
});
router.put('/seasons/:id', async (request, response, next) => {
  try {
    const data = parseSeason({ ...request.body?.data, id: String(request.params.id) });
    if (typeof request.body?.active !== 'boolean') throw new TowerRuleError('INVALID_CONFIG', '시즌 활성 여부를 확인해 주세요.');
    await db.transaction(async tx => {
      // Serialize concurrent activation; exactly one season may be active.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('tower:season-config'))`);
      if (request.body.active) await tx.update(towerSeasonsTable).set({ active: false, updatedAt: new Date() }).where(eq(towerSeasonsTable.active, true));
      await tx.insert(towerSeasonsTable).values({ id: data.id, name: data.name, active: request.body.active, data: data as unknown as Record<string, unknown> })
        .onConflictDoUpdate({ target: towerSeasonsTable.id, set: { name: data.name, active: request.body.active, data: data as unknown as Record<string, unknown>, updatedAt: new Date() } });
    });
    response.json({ data, active: request.body.active });
  } catch (error) { next(error); }
});
for (const kind of Object.keys(tables) as Array<keyof typeof tables>) router.put(`/${kind}/:id`, async (request, response, next) => {
  try {
    const data = parsers[kind]({ ...request.body?.data, id: String(request.params.id) });
    const table = tables[kind];
    await db.insert(table).values({ id: data.id, data: data as unknown as Record<string, unknown> }).onConflictDoUpdate({ target: table.id, set: { data: data as unknown as Record<string, unknown>, updatedAt: new Date() } });
    response.json({ data });
  } catch (error) { next(error); }
});
router.put('/metadata/:kind/:id', async (request, response, next) => {
  try {
    const kind = String(request.params.kind);
    if (kind !== 'CARD' && kind !== 'CHAMPION') throw new TowerRuleError('INVALID_CONFIG', '메타데이터 종류를 확인해 주세요.');
    const data = parseMetadata(request.body?.data); const id = String(request.params.id);
    const [existing] = await db.select().from(towerMetadataTable).where(eq(towerMetadataTable.id, id));
    if (existing && existing.kind !== kind) throw new TowerRuleError('INVALID_CONFIG', '다른 종류와 ID가 중복됩니다.');
    await db.insert(towerMetadataTable).values({ id, kind, data }).onConflictDoUpdate({ target: towerMetadataTable.id, set: { data } });
    response.json({ data });
  } catch (error) { next(error); }
});
router.post('/validate', async (_request, response, next) => {
  try { const snapshot = await loadTowerSnapshot(db,typeof _request.body?.towerId==='string'?_request.body.towerId:undefined,true); response.json({ valid: true, season: snapshot.catalog.season.name }); }
  catch (error) { next(error); }
});
router.get('/v2/:id/versions',async(request,response,next)=>{try{response.json({versions:await db.select({id:towerVersionsTable.id,version:towerVersionsTable.version,createdAt:towerVersionsTable.createdAt,publishedBy:towerVersionsTable.publishedBy}).from(towerVersionsTable).where(eq(towerVersionsTable.towerId,String(request.params.id))).orderBy(desc(towerVersionsTable.version))});}catch(e){next(e);}});
router.post('/v2/:id/publish',async(request,response,next)=>{try{
 const id=String(request.params.id);const snapshot=await loadTowerSnapshot(db,id,true);
 if(!snapshot.catalog.season.v2)throw new TowerRuleError('INVALID_CONFIG','V2 타워를 선택하세요.');
 const published=await db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'tower:publish:'+id}))`);
  const [row]=await tx.select().from(towerSeasonsTable).where(eq(towerSeasonsTable.id,id)).for('update');
  if(!row||JSON.stringify(parseSeason(row.data))!==JSON.stringify(snapshot.catalog.season))throw new TowerRuleError('STALE_CONFIG','설정이 변경됐습니다. 다시 검증하고 공개하세요.');
  const [last]=await tx.select().from(towerVersionsTable).where(eq(towerVersionsTable.towerId,id)).orderBy(desc(towerVersionsTable.version)).limit(1);
  const version=(last?.version??0)+1;
  await tx.insert(towerVersionsTable).values({id:randomUUID(),towerId:id,version,publishedBy:request.authUser!.id,snapshot:{...snapshot,contentVersion:version} as unknown as Record<string,unknown>});return version;
 });response.status(201).json({published:true,version:published});
}catch(e){next(e);}});
router.post('/relic-defaults', async (_request, response, next) => {
  try {
    for (const definition of TOWER_RELIC_DEFINITIONS) {
      const data = parseRelic({ id: `v1:${definition.type}`, name: definition.name, description: definition.description, effectType: definition.type, values: definition.values, enabled: true, initiallyUnlocked: true });
      await db.insert(towerRelicsTable).values({ id: data.id, data: data as unknown as Record<string, unknown> }).onConflictDoNothing();
    }
    response.json({ created: true });
  } catch (error) { next(error); }
});
router.get('/runs', async (_request, response, next) => {
  try { response.json({ runs: await db.select({ id: towerRunsTable.id, userId: towerRunsTable.userId, version: towerRunsTable.version, state: towerRunsTable.state, updatedAt: towerRunsTable.updatedAt }).from(towerRunsTable).orderBy(desc(towerRunsTable.updatedAt)).limit(100) }); }
  catch (error) { next(error); }
});
router.post('/runs/:id/close', async (request, response, next) => {
  try {
    await closeTowerRun(String(request.params.id));
    // Records and receipts are retained; closing never removes rewards or first-clear history.
    response.json({ closed: true });
  } catch (error) { next(error); }
});
router.use((error: unknown, _request: import('express').Request, response: import('express').Response, next: import('express').NextFunction) => {
  if (!(error instanceof TowerRuleError)) { next(error); return; }
  console.warn('[tower-admin]', error.code, error.message);
  response.status(422).json({ code: error.code, message: error.message });
});
export default router;
