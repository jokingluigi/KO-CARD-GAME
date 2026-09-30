import { and, eq } from 'drizzle-orm';
import { db, towerRunsTable } from '@workspace/db';
import { TowerRuleError, executeAction, type GameState, type TowerRun } from '@workspace/game-engine';
import { toServerAction } from '../online/action-parser';
import { advanceAIOpponent } from './ai-match-quest-service';
import { saveTowerBattle } from './tower-run-store';

export async function executeTowerPlayerAction(userId: string, runId: string, expectedVersion: number, payload: unknown) {
  const [row] = await db.select().from(towerRunsTable).where(and(eq(towerRunsTable.id, runId), eq(towerRunsTable.userId, userId)));
  if (!row) throw new TowerRuleError('RUN_NOT_FOUND', '타워 도전을 찾을 수 없습니다.');
  if (row.version !== expectedVersion) throw new TowerRuleError('STALE_RUN', '진행 상태가 변경됐습니다. 다시 불러와 주세요.');
  if ((row.state as unknown as TowerRun).phase !== 'BATTLE' || !row.currentBattle) throw new TowerRuleError('INVALID_PHASE', '진행 중인 전투가 없습니다.');
  const action = toServerAction(payload, 'player-1');
  if (!action) throw new TowerRuleError('INVALID_ACTION', '전투 명령을 확인해 주세요.');
  const result = executeAction(row.currentBattle as unknown as GameState, action);
  if (!result.success) throw new TowerRuleError(result.errorCode, result.message);
  let state = result.state;
  if (state.openingMulligan && state.players.find(player => player.id === 'player-1')?.mulliganUsed) {
    const enemy = state.players.find(player => player.id === 'player-2')!;
    const mulligan = executeAction(state, { type: 'MULLIGAN', playerId: enemy.id, cardInstanceIds: enemy.hand.filter(card => card.currentCost > 3).map(card => card.instanceId) });
    if (!mulligan.success) throw new TowerRuleError('AI_ACTION_FAILED', '상대 손패 교체를 처리하지 못했습니다. 다시 시도해 주세요.');
    state = mulligan.state;
  }
  if (!state.openingMulligan) state = advanceAIOpponent(state, 'player-2', (row.state as unknown as TowerRun).encounter.difficulty);
  // CAS and the account lock prevent concurrent actions from settling the same win twice.
  return saveTowerBattle(userId, runId, expectedVersion, state);
}
