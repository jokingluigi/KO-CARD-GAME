import type { CardInstance } from '../cards/types';
import type { ChampionState } from '../champions/types';
import type { GameEvent } from '../events/types';

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
}