import type { GameAction } from '../game/actions/types';

/** The server binds the player identity from the authenticated run. */
export function towerActionPayload(action: GameAction) {
  const { playerId: _playerId, ...payload } = action;
  return payload;
}
