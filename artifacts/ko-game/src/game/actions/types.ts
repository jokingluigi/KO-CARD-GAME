import type { GameState } from '../types/game-state';

export interface GameAction {
  type: string;
  playerId: string;
}

export type ActionErrorCode =
  | 'NOT_ENOUGH_GOLD'
  | 'BOARD_FULL'
  | 'INVALID_SLOT'
  | 'NOT_YOUR_TURN'
  | 'CARD_NOT_IN_HAND'
  | 'SUMMONED_THIS_TURN'
  | 'ATTACK_ALREADY_USED'
  | 'INVALID_ATTACK_TARGET'
  | 'GAME_NOT_IN_PROGRESS'
  | 'CARD_STUNNED'
  | 'TAUNT_TARGET_REQUIRED'
  | 'ACTIVE_NOT_AVAILABLE'
  | 'ACTIVE_ALREADY_USED';

export type ActionResult =
  | {
      success: true;
      state: GameState;
    }
  | {
      success: false;
      state: GameState;
      errorCode: ActionErrorCode;
      message: string;
    };

export function actionSuccess(state: GameState): ActionResult {
  return { success: true, state };
}

export function actionFailure(
  state: GameState,
  errorCode: ActionErrorCode,
  message: string,
): ActionResult {
  return { success: false, state, errorCode, message };
}