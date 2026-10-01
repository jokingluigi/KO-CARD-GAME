import type { CardInstance } from '../cards/types';
import type { GameState } from '../types/game-state';

export function findDirectDeployedChampion(
  state: GameState,
  playerId: string,
): CardInstance | null {
  const player = state.players.find((candidate) => candidate.id === playerId);
  return (
    player?.board.find((card) => card?.isChampionToken || card?.isDirectDeployedChampion) ?? null
  );
}

export function isChampionProtectedByToken(
  state: GameState,
  playerId: string,
): boolean {
  return Boolean(state.players.find(p => p.id === playerId)?.board.some(card => card && (card.isChampionToken || card.isDirectDeployedChampion || (state.cardPool?.find(d => d.id === card.definitionId) ?? state.minionACardPool?.find(d => d.id === card.definitionId))?.rarity === 'CHAMPION')));
}

export function getPlayerSurvivalHealth(
  state: GameState,
  playerId: string,
): number {
  return (
    state.players.find((player) => player.id === playerId)?.health ?? 0
  );
}
