import type { CardInstanceId } from '../cards/types';

export type LeaveReason = 'RETIRE' | 'DESTROY' | 'REMOVE_FROM_GAME';

export interface GameEvent {
  type: string;
}

export interface CardLeftPlayEvent extends GameEvent {
  type: 'CARD_LEFT_PLAY';
  playerId: string;
  cardInstanceId: CardInstanceId;
  leaveReason: LeaveReason;
}