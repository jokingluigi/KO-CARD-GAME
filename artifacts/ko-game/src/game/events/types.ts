import type { CardInstanceId } from '../cards/types';

export type LeaveReason = 'RETIRE' | 'DESTROY' | 'REMOVE_FROM_GAME';

export interface GameEvent {
  type: string;
}

export interface EnterFieldEvent extends GameEvent {
  type: 'ENTER_FIELD';
  playerId: string;
  cardInstanceId: CardInstanceId;
  boardSlot: 0 | 1 | 2 | 3;
}

export interface CardLeftPlayEvent extends GameEvent {
  type: 'CARD_LEFT_PLAY';
  playerId: string;
  cardInstanceId: CardInstanceId;
  leaveReason: LeaveReason;
}