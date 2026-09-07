import type { CardInstance } from '../cards/types';
import type { ChampionState } from '../champions/types';
import type { GameEvent } from '../events/types';
import type { CardEffect } from '../effects/types';

export type Board = [
  CardInstance | null,
  CardInstance | null,
  CardInstance | null,
  CardInstance | null,
];

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
  turn: number;
  activePlayerId: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED';
  winnerId: string | null;
  loserId: string | null;
  players: PlayerState[];
  events: GameEvent[];
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
    validTargetIds: string[];
    minTargets: number;
    maxTargets: number;
    mandatory: boolean;
    cancelable: boolean;
    markActiveUsed?: boolean;
    /** Parent resolution frame. A child trigger always resolves before this. */
    continuation?: GameState['targetingState'];
  };
}