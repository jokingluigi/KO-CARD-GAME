import type { GameState, PlayerState } from '../types/game-state';

function createEmptyPlayer(id: string): PlayerState {
  return {
    id,
    health: 20,
    maxHealth: 20,
    currentGold: 0,
    personalTurn: 0,
    nextTurnGoldBonus: 0,
    deck: [],
    hand: [],
    board: [null, null, null, null],
    graveyard: [],
    removedFromGame: [],
    fatigueCount: 0,
    champion: null,
  };
}

export function createInitialGameState(): GameState {
  return {
    gameId: 'local-prototype',
    turn: 0,
    activePlayerId: null,
    players: [createEmptyPlayer('player-1'), createEmptyPlayer('player-2')],
  };
}

export const initialGameState = createInitialGameState();