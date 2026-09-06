import type { GameState, PlayerState } from '../types/game-state';
import type { CardDefinition } from '../cards/types';
import { createTestDeck } from '../cards/test-cards';
import { createChampionState } from '../champions/test-champions';

function createEmptyPlayer(
  id: string,
  championId: string,
  cardDefinitions?: readonly CardDefinition[],
): PlayerState {
  return {
    id,
    health: 20,
    maxHealth: 20,
    currentGold: 0,
    personalTurn: 0,
    nextTurnGoldBonus: 0,
    deck: createTestDeck(id, cardDefinitions),
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
  cardDefinitions?: readonly CardDefinition[],
): GameState {
  return {
    gameId: 'local-prototype',
    turn: 0,
    activePlayerId: null,
    status: 'NOT_STARTED',
    winnerId: null,
    loserId: null,
    players: [
      createEmptyPlayer('player-1', championIds[0], cardDefinitions),
      createEmptyPlayer('player-2', championIds[1], cardDefinitions),
    ],
    events: [],
  };
}

export const initialGameState = createInitialGameState();