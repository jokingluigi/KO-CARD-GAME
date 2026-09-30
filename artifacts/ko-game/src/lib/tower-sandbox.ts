import type { CardDefinition } from '@/game/cards/types';
import type { ChampionDefinition } from '@/game/champions/types';
import { initializeTowerBattle } from '../../../../lib/game-engine/src/tower/battle';
import { seedNumber, eligibleRewardCard } from '../../../../lib/game-engine/src/tower/domain';

export const TOWER_SANDBOX_KEY = 'ko-tower-sandbox-v1';
export interface TowerSandboxSetup { floor: number; seed: string; championId: string; enemyChampionId: string; playerDeck: string[]; enemyDeck: string[] }
export function parseTowerSandboxSetup(value: unknown): TowerSandboxSetup {
  const s = value as Partial<TowerSandboxSetup> | null;
  if (!s || !Number.isInteger(s.floor) || s.floor! < 1 || s.floor! > 16 || typeof s.seed !== 'string' || !s.seed.trim() || s.seed.length > 120 ||
    typeof s.championId !== 'string' || typeof s.enemyChampionId !== 'string' ||
    !Array.isArray(s.playerDeck) || s.playerDeck.length !== 25 || s.playerDeck.some(id => typeof id !== 'string') ||
    !Array.isArray(s.enemyDeck) || s.enemyDeck.length !== 25 || s.enemyDeck.some(id => typeof id !== 'string')) throw new Error('테스트 설정이 올바르지 않습니다. 관리자에서 다시 시작해 주세요.');
  return { floor: s.floor!, seed: s.seed, championId: s.championId, enemyChampionId: s.enemyChampionId, playerDeck: [...s.playerDeck], enemyDeck: [...s.enemyDeck] };
}
export function towerSandboxEligible(card: CardDefinition): boolean {
  return eligibleRewardCard({ id: card.id, status: card.status ?? 'DRAFT', cost: card.cost, cardType: card.cardType ?? 'WRESTLER', rarity: card.rarity ?? 'NORMAL',
    isToken: card.isToken, isChampionToken: card.isChampionToken, synergyTags: [], supportsTags: [] });
}
/** Isolated single-battle diagnostic: never persists account rewards or run records. */
export function createTowerSandbox(value: unknown, cards: CardDefinition[], champions: ChampionDefinition[]) {
  const setup = parseTowerSandboxSetup(value);
  const allowed = new Set(cards.filter(towerSandboxEligible).map(card => card.id));
  if ([...setup.playerDeck, ...setup.enemyDeck].some(id => !allowed.has(id))) throw new Error('테스트 덱에는 공개된 덱 사용 가능 카드만 넣을 수 있습니다.');
  return initializeTowerBattle({ gameId: `admin-tower-sandbox:${setup.floor}`, seed: seedNumber(`${setup.seed}:battle:${setup.floor}`),
    championIds: [setup.championId, setup.enemyChampionId], decks: [setup.playerDeck, setup.enemyDeck] }, cards, champions);
}
