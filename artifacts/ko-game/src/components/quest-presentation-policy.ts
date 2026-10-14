import type { GameState } from '@/game';

/** A terminal hit must never announce a quest over the defeat presentation. */
export function canPresentBattleQuest(state: Pick<GameState, 'status' | 'players'> | null | undefined): boolean {
  return state?.status === 'IN_PROGRESS' && state.players.every(player => player.health > 0);
}
