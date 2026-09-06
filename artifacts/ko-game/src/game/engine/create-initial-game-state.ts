import type { GameState, PlayerState } from '../types/game-state';
import { createTestDeck } from '../cards/test-cards';
import { createChampionState } from '../champions/test-champions';

function createEmptyPlayer(id: string, championId: string): PlayerState {
  return {
    id,
    health: 20,
    maxHealth: 20,
    currentGold: 0,
    personalTurn: 0,
    nextTurnGoldBonus: 0,
    deck: createTestDeck(id),
    hand: [],
    board: [null, null, null, null],
    graveyard: [],
    removedFromGame: [],
    fatigueCount: 0,
    champion: createChampionState(championId),
  };
}

export function createInitialGameState(
  championIds: [string, string] = [
    'test-champion-quest',
    'test-champion-no-quest',
  ],
): GameState {
  return {
    gameId: 'local-prototype',
    turn: 0,
    activePlayerId: null,
    status: 'NOT_STARTED',
    winnerId: null,
    loserId: null,
    players: [
      createEmptyPlayer('player-1', championIds[0]),
      createEmptyPlayer('player-2', championIds[1]),
    ],
    events: [],
  };
}

export const initialGameState = createInitialGameState();