import type { GameState } from '../types/game-state';
import type { BoardSlot } from '../engine/board-position';
import type { AttackTarget } from '../engine/combat';

export type GameAction =
  | { type: 'PLAY_WRESTLER'; playerId: string; cardInstanceId: string; boardSlot: BoardSlot }
  | { type: 'PLAY_TECHNIQUE'; playerId: string; cardInstanceId: string }
  | { type: 'USE_ACTIVE'; playerId: string; cardInstanceId: string }
  | { type: 'USE_CHAMPION_ABILITY'; playerId: string }
  | { type: 'ATTACK'; playerId: string; attackerInstanceId: string; target: AttackTarget }
  | { type: 'SELECT_EFFECT_TARGET'; playerId: string; targetId: string }
  | { type: 'CANCEL_EFFECT_TARGET'; playerId: string }
  | { type: 'BEGIN_TARGETED_ACTION'; playerId: string; action: {
      type: 'PLAY_TECHNIQUE'; cardInstanceId: string;
    } | { type: 'USE_ACTIVE'; cardInstanceId: string } | { type: 'USE_CHAMPION_ABILITY' } }
  | { type: 'CONFIRM_PRECOMMIT_TARGET'; playerId: string; targetId: string }
  | { type: 'END_TURN'; playerId: string }
  | { type: 'SURRENDER'; playerId: string };

export type ActionType = GameAction['type'];

export interface BaseGameAction {
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
  | 'ACTIVE_ALREADY_USED'
  | 'CHAMPION_NOT_SELECTED'
  | 'CHAMPION_ABILITY_UNAVAILABLE'
  | 'CHAMPION_ABILITY_ALREADY_USED'
  | 'DIRECT_CHAMPION_ALREADY_DEPLOYED'
  | 'DIRECT_CHAMPION_CANNOT_BE_DESTROYED'
  | 'TARGET_SELECTION_PENDING'
  | 'NO_VALID_TARGET'
  | 'CHAMPION_TOKEN_NOT_CONFIGURED'
  | 'CHAMPION_TOKEN_REFERENCE_INVALID'
  | 'INVALID_PLAYER';

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