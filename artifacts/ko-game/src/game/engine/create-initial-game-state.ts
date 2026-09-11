import type { GameState, PlayerState } from '../types/game-state';
import type { CardDefinition } from '../cards/types';
import { createTestDeck } from '../cards/test-cards';
import { createChampionState } from '../champions/test-champions';
import type { ChampionDefinition } from '../champions/types';

function createEmptyPlayer(
  id: string,
  championId: string,
  cardDefinitions?: readonly CardDefinition[],
  championDefinitions?: readonly ChampionDefinition[],
): PlayerState {
  const deckDefinitions = cardDefinitions?.filter(
    (definition) => definition.cardType === 'WRESTLER' && !definition.isToken && !definition.isChampionToken,
  );
  return {
    id,
    health: 20,
    maxHealth: 20,
    currentGold: 0,
    personalTurn: 0,
    nextTurnGoldBonus: 0,
    deck: createTestDeck(id, deckDefinitions),
    hand: [],
    board: [null, null, null, null],
    graveyard: [],
    removedFromGame: [],
    fatigueCount: 0,
    champion: createChampionState(championId, championDefinitions),
  };
}

export function createInitialGameState(
  championIds: [string, string] = [
    'test-champion-quest',
    'test-champion-no-quest',
  ],
  cardDefinitions?: readonly CardDefinition[],
  championDefinitions?: readonly ChampionDefinition[],
): GameState {
  return {
    gameId: 'local-prototype',
    cardPool: cardDefinitions ? [...cardDefinitions] : undefined,
    backgroundId: null,
    bgmId: null,
    latestQuestCompletedChampionId: null,
    turn: 0,
    activePlayerId: null,
    status: 'NOT_STARTED',
    winnerId: null,
    loserId: null,
    players: [
      createEmptyPlayer('player-1', championIds[0], cardDefinitions, championDefinitions),
      createEmptyPlayer('player-2', championIds[1], cardDefinitions, championDefinitions),
    ],
    events: [],
    pendingCardEffects: [],
  };
}

export const initialGameState = createInitialGameState();