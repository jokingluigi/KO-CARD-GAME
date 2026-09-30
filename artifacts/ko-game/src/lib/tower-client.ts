import { projectOnlineGameState } from './online-game-state';
import type { AccountReward, TowerRun, Starter, Relic, Scene, StoryCharacter, RunCommand } from '../../../../lib/game-engine/src/tower/types';
import type { CardDefinition, ChampionDefinition, GameState } from '@/game';
export type VisibleTowerRun = Omit<TowerRun, 'seed' | 'encounter'> & { encounter: Omit<TowerRun['encounter'], 'seed'> };
export interface TowerHomeData { season: { id: string; name: string; description: string }; champions: ChampionDefinition[]; starters: Starter[]; cards: CardDefinition[] }
export interface TowerView { run: VisibleTowerRun | null; battle?: GameState | null; cards?: CardDefinition[]; champions?: ChampionDefinition[]; relics?: Relic[]; scenes?: Scene[]; characters?: StoryCharacter[]; rewardReceipts?: Array<{ slot: string; firstClear: boolean; reward: AccountReward }>; rewardPreview?: { firstReward: AccountReward; repeatReward: AccountReward } | null }
export const towerDiagnostic = new URLSearchParams(window.location.search).get('towerTest') === '1';
const base = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/${towerDiagnostic ? 'admin/tower/test' : 'tower'}`;
export class TowerRequestError extends Error { constructor(message: string, public code: string, public status: number) { super(message); } }
export async function towerRequest<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
  const response = await fetch(`${base}${path}`, { signal: controller.signal, credentials: 'include', cache: 'no-store', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new TowerRequestError(data.message ?? '타워 요청을 처리하지 못했습니다.', data.code ?? 'REQUEST_FAILED', response.status);
  if (data.battle) {
    const projected = projectOnlineGameState(data.battle, 'player-1');
    if (!projected) throw new TowerRequestError('전투 상태를 표시할 수 없습니다. 다시 불러와 주세요.', 'INVALID_BATTLE_VIEW', 502);
    data.battle = projected;
  }
  return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new TowerRequestError('응답이 지연되고 있습니다. 진행 상태를 다시 불러와 주세요.', 'REQUEST_TIMEOUT', 408);
    throw error;
  } finally { window.clearTimeout(timeout); }
}
export const towerCommand = (run: VisibleTowerRun, command: Exclude<RunCommand, { type: 'BATTLE_RESULT' }>) => towerRequest<TowerView>(`/runs/${run.id}/command`, { version: run.version, command });
