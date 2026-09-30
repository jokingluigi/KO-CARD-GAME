import type { CardDefinition, CardInstance } from '../cards/types';
import type { GameState } from '../types/game-state';

export const ZOMBIE_RULES = '아군 필드에는 좀비를 1장만 둘 수 있습니다. 이미 아군 좀비가 있다면 새 좀비를 소환하지 않고 소환될 좀비의 능력치만큼 기존 좀비에게 부여합니다. 필드에 있는 동안 다른 아군 또는 상대 선수가 리타이어할 때마다 +1/+1을 얻습니다.';
export function isZombieToken(state: GameState, card: CardInstance): boolean {
  return card.isToken && (card.definitionId === 'ko-fallback-zombie-token' ||
    state.cardPool?.some(d => d.id === card.definitionId && d.name.trim() === '좀비') === true);
}
export function normalizeZombieDefinition(definition: CardDefinition): CardDefinition {
  return definition.isToken && definition.name.trim() === '좀비'
    ? { ...definition, cost: 1, attack: 1, health: 1, rulesText: ZOMBIE_RULES, abilities: [], keywords: [] }
    : definition;
}
export function existingZombie(state: GameState, playerId: string): CardInstance | undefined {
  return state.players.find(p => p.id === playerId)?.board.find((c): c is CardInstance => Boolean(c && isZombieToken(state, c)));
}
export function mergeZombie(state: GameState, playerId: string, incoming: CardInstance): GameState | undefined {
  if (!isZombieToken(state, incoming)) return undefined;
  const existing = existingZombie(state, playerId);
  if (!existing || existing.instanceId === incoming.instanceId) return undefined;
  return { ...state, players: state.players.map(p => p.id !== playerId ? p : {
    ...p, hand: p.hand.filter(c => c.instanceId !== incoming.instanceId),
    board: p.board.map(c => c?.instanceId !== existing.instanceId ? c : {
      ...c, currentAttack: c.currentAttack + incoming.currentAttack,
      currentHealth: c.currentHealth + incoming.currentHealth, maxHealth: c.maxHealth + incoming.currentHealth,
    }) as typeof p.board,
  }) };
}
