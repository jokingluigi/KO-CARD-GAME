import type { CardInstance } from '../cards/types';
import type { GameState } from '../types/game-state';

export function findDirectDeployedChampion(
  state: GameState,
  playerId: string,
): CardInstance | null {
  const player = state.players.find((candidate) => candidate.id === playerId);
  return (
    player?.board.find((card) => card?.isDirectDeployedChampion) ?? null
  );
}

export function isChampionProtectedByToken(
  state: GameState,
  playerId: string,
): boolean {
  return Boolean(findDirectDeployedChampion(state, playerId));
}

export function getPlayerSurvivalHealth(
  state: GameState,
  playerId: string,
): number {
  const directChampion = findDirectDeployedChampion(state, playerId);
  if (directChampion) return directChampion.currentHealth;
  return (
    state.players.find((player) => player.id === playerId)?.health ?? 0
  );
}
