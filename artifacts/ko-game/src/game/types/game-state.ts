import type { CardInstance } from '../cards/types';
import type { CardDefinition } from '../cards/types';
import type { ChampionState } from '../champions/types';
import type { GameEvent } from '../events/types';
import type { CardEffect, QueuedStructuredEffect } from '../effects/types';

export type Board = [
  CardInstance | null,
  CardInstance | null,
  CardInstance | null,
  CardInstance | null,
];

export interface PendingCardEffect {
  playerId: string;
  sourceInstanceId: string;
  trigger: 'NEXT_ALLY_WRESTLER_PLAYED';
  effect: QueuedStructuredEffect;
}

export interface PlayerState {
  id: string;
  health: number;
  maxHealth: number;
  currentGold: number;
  personalTurn: number;
  nextTurnGoldBonus: number;
  deck: CardInstance[];
  hand: CardInstance[];
  board: Board;
  graveyard: CardInstance[];
  removedFromGame: CardInstance[];
  fatigueCount: number;
  champion: ChampionState | null;
}

export interface GameState {
  gameId: string;
  /** Seed used by deterministic random effect resolution. */
  randomSeed?: number;
  /** Published definitions available to random generation effects. */
  cardPool?: CardDefinition[];
  backgroundId: string | null;
  bgmId: string | null;
  turn: number;
  activePlayerId: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED';
  winnerId: string | null;
  loserId: string | null;
  players: PlayerState[];
  events: GameEvent[];
  pendingCardEffects: PendingCardEffect[];
  /** Effect resolution is deliberately part of game state, not UI state. */
  targetingState?: {
    active: true;
    playerId: string;
    sourceInstanceId: string;
    /** Snapshot permits champion abilities (which have no board card source). */
    sourceCard?: CardInstance;
    effects: CardEffect[];
    effectIndex: number;
    selectedTargetIds: string[];
    lastTargetIds: string[];
     /** Values produced by a previous structured effect in this resolution frame. */
     lastAggregatedStats?: {
       attack: number;
       health: number;
     };
    validTargetIds: string[];
    minTargets: number;
    maxTargets: number;
    mandatory: boolean;
    cancelable: boolean;
    markActiveUsed?: boolean;
    /** Trigger context is carried in state so chained resolutions remain deterministic. */
    triggerContext?: {
      playedFromHand?: boolean;
      baseCost?: number;
      attackerInstanceId?: string;
      damagedTargetInstanceId?: string;
      healthBefore?: number;
      healthAfter?: number;
    };
    /** Parent resolution frame. A child trigger always resolves before this. */
    continuation?: GameState['targetingState'];
  };
}