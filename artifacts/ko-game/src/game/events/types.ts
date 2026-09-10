import type { CardInstanceId } from '../cards/types';

export type LeaveReason = 'RETIRE' | 'DESTROY' | 'REMOVE_FROM_GAME';

export type GameEventType =
  | 'TURN_STARTED'
  | 'TURN_ENDED'
  | 'CARD_DRAWN'
  | 'CARD_PLAYED'
  | 'ENTER_FIELD'
  | 'CARD_GENERATED'
  | 'CARD_DESTROYED'
  | 'CARD_RETIRED'
  | 'CARD_REMOVED'
  | 'DAMAGE_DEALT'
  | 'ATTACK_DECLARED'
  | 'GOLD_CHANGED'
  | 'CHAMPION_ABILITY_USED'
  | 'CHAMPION_QUEST_PROGRESS'
  | 'CHAMPION_QUEST_COMPLETED'
  | 'SURRENDER';

export type EventSubject =
  | { type: 'PLAYER'; playerId: string }
  | { type: 'CARD'; cardInstanceId: CardInstanceId }
  | { type: 'CHAMPION'; championId: string }
  | { type: 'SYSTEM' };

export interface GameEvent {
  type: GameEventType;
  playerId?: string;
  cardInstanceId?: CardInstanceId;
  championId?: string;
  source?: EventSubject;
  target?: EventSubject;
  reason?: string;
  amount?: number;
  boardSlot?: 0 | 1 | 2 | 3;
  tags?: string[];
}

export interface EnterFieldEvent extends GameEvent {
  type: 'ENTER_FIELD';
  playerId: string;
  cardInstanceId: CardInstanceId;
  boardSlot: 0 | 1 | 2 | 3;
}

export interface RetireEvent extends GameEvent {
  type: 'CARD_RETIRED';
  playerId: string;
  cardInstanceId: CardInstanceId;
  boardSlot: 0 | 1 | 2 | 3;
  reason: 'RETIRE';
}

export interface DestroyEvent extends GameEvent {
  type: 'CARD_DESTROYED';
  playerId: string;
  cardInstanceId: CardInstanceId;
  boardSlot: 0 | 1 | 2 | 3;
  reason: 'DESTROY';
}