import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { GameState } from '../types/game-state';

/**
 * Records a player's surrender as a normal terminal game result.
 * This action deliberately does not alter cards, health, or any other game rule.
 */
export function surrender(
  state: GameState,
  surrenderingPlayerId: string,
): ActionResult {
  if (state.status !== 'IN_PROGRESS') {
    return actionFailure(
      state,
      'GAME_NOT_IN_PROGRESS',
      '진행 중인 게임에서만 항복할 수 있습니다.',
    );
  }

  const surrenderingPlayer = state.players.find(
    (player) => player.id === surrenderingPlayerId,
  );
  if (!surrenderingPlayer) {
    return actionFailure(
      state,
      'INVALID_PLAYER',
      '항복할 플레이어를 찾을 수 없습니다.',
    );
  }

  const winner = state.players.find(
    (player) => player.id !== surrenderingPlayerId,
  );
  if (!winner) {
    return actionFailure(
      state,
      'INVALID_PLAYER',
      '상대 플레이어를 찾을 수 없습니다.',
    );
  }

  return actionSuccess({
    ...state,
    status: 'FINISHED',
    activePlayerId: null,
    winnerId: winner.id,
    loserId: surrenderingPlayerId,
    events: [
      ...state.events,
      {
        type: 'SURRENDER',
        playerId: surrenderingPlayerId,
        source: { type: 'PLAYER', playerId: surrenderingPlayerId },
        target: { type: 'PLAYER', playerId: surrenderingPlayerId },
        reason: 'SURRENDER',
      },
    ],
  });
}