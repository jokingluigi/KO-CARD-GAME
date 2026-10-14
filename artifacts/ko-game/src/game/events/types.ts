import type { CardInstanceId } from '../cards/types';

export type LeaveReason = 'RETIRE' | 'DESTROY' | 'REMOVE_FROM_GAME';
export type EntryCause = 'PLAY_FROM_HAND' | 'SUMMON' | 'REVIVE' | 'CHAMPION_DEPLOY';

export type GameEventType =
  | 'CHAMPION_GAME_START_ABILITY'
  | 'CHAMPION_EMOTE'
  | 'MULLIGAN_COMPLETED'
  | 'TURN_STARTED'
  | 'TURN_ENDED'
  | 'TURN_TIMEOUT'
  | 'CARD_REVEALED'
  | 'CARD_DRAWN'
  | 'CARD_PLAYED'
  | 'ENTER_FIELD'
  | 'CARD_GENERATED'
  | 'CARD_TRANSFORMED'
  | 'CARD_DESTROYED'
  | 'CARD_RETIRED'
  | 'CARD_REMOVED'
  | 'FUSION'
  | 'CARD_VANISHED'
  | 'DAMAGE_DEALT'
  | 'ATTACK_DECLARED'
  | 'GOLD_CHANGED'
  | 'CHAMPION_ABILITY_USED'
  | 'CHAMPION_QUEST_PROGRESS'
  | 'CHAMPION_QUEST_COMPLETED'
  | 'STAT_CHANGED'
  | 'CARD_TEXT_GRANTED'
  | 'SURRENDER';

export type EventSubject =
  | { type: 'PLAYER'; playerId: string }
  | { type: 'CARD'; cardInstanceId: CardInstanceId }
  | { type: 'CHAMPION'; championId: string }
  | { type: 'SYSTEM' };

/** Serializable provenance carried through nested effect resolution. */
export interface EventAttribution {
  sourcePlayerId: string;
  sourceActionType: string;
  sourceChampionDefinitionId?: string;
  sourceChampionInstanceId?: string;
  sourceAbilityId?: string;
  sourceEffectId?: string;
  rootSourceEventId?: string;
  causationId?: string;
  /** One damage effect may replace only this target's resulting lethal retirement. */
  retireAsDestroyTargetId?: string;
}

export interface GameEvent {
  type: GameEventType;
  /** Deliberate public disclosure of exactly one card, without the rest of its zone. */
  revealedCard?: {definitionId:string;name:string;cost:number;attack:number;health:number;rulesText:string;imageUrl?:string|null};
  cardDefinitionId?: string;
  playerId?: string;
  cardInstanceId?: CardInstanceId;
  cardType?: 'WRESTLER' | 'TECHNIQUE';
  championId?: string;
  source?: EventSubject;
  target?: EventSubject;
  reason?: string;
  amount?: number;
  excessDamage?: number;
  boardSlot?: 0 | 1 | 2 | 3;
  tags?: string[];
  stat?: 'cost' | 'attack' | 'health' | 'maxHealth' | 'currentHealth';
  before?: number;
  after?: number;
  delta?: number;
  duration?: 'THIS_TURN' | 'UNTIL_NEXT_TURN' | 'PERMANENT';
  sourceContext?: EventAttribution;
  sourceSnapshot?: EventCardSnapshot;
  targetSnapshot?: EventCardSnapshot;
  grantedFromDefinitionId?: string;
}

export interface EventCardSnapshot {
  playerId: string;
  cardInstanceId: CardInstanceId;
  cardType: 'WRESTLER' | 'TECHNIQUE';
  boardSlot: 0 | 1 | 2 | 3 | null;
  currentAttack?: number;
  currentHealth?: number;
}

export interface EnterFieldEvent extends GameEvent {
  type: 'ENTER_FIELD';
  playerId: string;
  cardInstanceId: CardInstanceId;
  boardSlot: 0 | 1 | 2 | 3;
  entryCause: EntryCause;
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
