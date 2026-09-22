import type { GameState, PlayerState } from '../types/game-state';
import type { CardDefinition } from '../cards/types';
import { createDeckFromDefinitionIds, createTestDeck } from '../cards/test-cards';
import { createChampionState } from '../champions/test-champions';
import type { ChampionDefinition } from '../champions/types';

function createEmptyPlayer(
  id: string,
  championId: string,
  cardDefinitions?: readonly CardDefinition[],
  championDefinitions?: readonly ChampionDefinition[],
  deckDefinitionIds?: readonly string[],
): PlayerState {
  const deckDefinitions = cardDefinitions?.filter(
    (definition) => !definition.isToken && !definition.isChampionToken,
  );
  const champion = createChampionState(championId, championDefinitions);
  return {
    id,
    health: champion.maxHealth,
    maxHealth: champion.maxHealth,
    currentGold: 0,
    personalTurn: 0,
    nextTurnGoldBonus: 0,
    deck: deckDefinitionIds
      ? createDeckFromDefinitionIds(id, deckDefinitionIds, deckDefinitions ?? [])
      : createTestDeck(id, deckDefinitions),
    hand: [],
    board: [null, null, null, null],
    graveyard: [],
    removedFromGame: [],
    fatigueCount: 0,
    championAbilityUsedThisTurn: false,
    champion,
  };
}

export function createInitialGameState(
  championIds: [string, string] = [
    'test-champion-quest',
    'test-champion-no-quest',
  ],
  cardDefinitions?: readonly CardDefinition[],
  championDefinitions?: readonly ChampionDefinition[],
  deckDefinitionIds?: readonly [readonly string[], readonly string[]],
  options?: { gameId?: string; randomSeed?: number },
): GameState {
  return {
    gameId: options?.gameId ?? 'local-prototype',
    ...(options?.randomSeed === undefined ? {} : { randomSeed: options.randomSeed }),
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
      createEmptyPlayer('player-1', championIds[0], cardDefinitions, championDefinitions, deckDefinitionIds?.[0]),
      createEmptyPlayer('player-2', championIds[1], cardDefinitions, championDefinitions, deckDefinitionIds?.[1]),
    ],
    events: [],
    pendingCardEffects: [],
  };
}

export const initialGameState = createInitialGameState();