import type { GameState, PlayerState } from '../types/game-state';
import type { GameMediaCatalog } from '../media';
import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { RandomSource } from '../random/random';
import { MAX_DECK_SIZE, MIN_DECK_SIZE } from '../rules/constants';
import { drawCard } from './draw-card';
import { defaultRandom, shuffle } from '../random/random';
import { processChampionQuestEvents } from '../champions/quests';
import { resolvePendingEffects, resolveTriggeredAbilities } from '../effects/effect-engine';

function beginPlayerTurn(state: GameState, playerId: string): GameState {
  const player = state.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    throw new Error(`플레이어를 찾을 수 없습니다: ${playerId}`);
  }

  const personalTurn = player.personalTurn + 1;
  const baseTurnGold = Math.min(personalTurn, 6);
  const currentGold = baseTurnGold + player.nextTurnGoldBonus;
  const turnStartedState: GameState = {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? {
            ...candidate,
            personalTurn,
            currentGold,
            nextTurnGoldBonus: 0,
             championAbilityUsedThisTurn: false,
            board: candidate.board.map((card) =>
              card
                ? {
                    ...card,
                    enteredThisTurn: false,
                    attacksUsedThisTurn: 0,
                     activeUsedThisTurn: false,
                  }
                : null,
            ) as typeof candidate.board,
          }
        : candidate,
    ),
    events: [
      ...state.events,
      {
        type: 'TURN_STARTED',
        playerId,
        source: { type: 'SYSTEM' },
        target: { type: 'PLAYER', playerId },
        reason: 'TURN_START',
      },
      {
        type: 'GOLD_CHANGED',
        playerId,
        source: { type: 'SYSTEM' },
        target: { type: 'PLAYER', playerId },
        reason: 'TURN_REFRESH',
        amount: currentGold - player.currentGold,
      },
    ],
  };

  const afterDraw = drawCard(turnStartedState, playerId);
  return afterDraw.players
    .find((candidate) => candidate.id === playerId)
    ?.board
    .filter((card): card is NonNullable<typeof card> => Boolean(card))
    .reduce((nextState, card) => {
      const currentCard = nextState.players
        .find((player) => player.id === playerId)
        ?.board.find((candidate) => candidate?.instanceId === card.instanceId);
      if (!currentCard) return nextState;
      const triggered = resolveTriggeredAbilities(nextState, playerId, currentCard, 'TURN_START');
      return triggered.targetingState?.active ? resolvePendingEffects(triggered) : triggered;
    }, afterDraw) ?? afterDraw;
}

function drawOpeningHand(
  state: GameState,
  playerId: string,
  cardCount: number,
): GameState {
  let nextState = state;

  for (let count = 0; count < cardCount; count += 1) {
    nextState = drawCard(nextState, playerId);
  }

  return nextState;
}

export function prepareDecks(
  state: GameState,
  random?: RandomSource,
): GameState {
  for (const player of state.players) {
    if (
      player.deck.length < MIN_DECK_SIZE ||
      player.deck.length > MAX_DECK_SIZE
    ) {
      throw new Error(
        `덱은 ${MIN_DECK_SIZE}장 이상 ${MAX_DECK_SIZE}장 이하여야 합니다: ${player.id}`,
      );
    }
  }

  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      deck: shuffle(player.deck, random),
    })),
  };
}

export function dealOpeningHands(state: GameState): GameState {
  const firstPlayer = state.players[0];
  const secondPlayer = state.players[1];
  const firstPlayerDealt = drawOpeningHand(state, firstPlayer.id, 3);
  return drawOpeningHand(firstPlayerDealt, secondPlayer.id, 4);
}

export function isCurrentPlayer(
  state: GameState,
  playerId: string,
): boolean {
  return state.activePlayerId === playerId;
}

export function validateCurrentPlayer(
  state: GameState,
  playerId: string,
): ActionResult | null {
  return isCurrentPlayer(state, playerId)
    ? null
    : actionFailure(state, 'NOT_YOUR_TURN', '상대의 턴입니다.');
}

export function startGame(
  state: GameState,
  random?: RandomSource,
  mediaCatalog?: GameMediaCatalog,
): GameState {
  if (state.players.length !== 2) {
    throw new Error('게임을 시작하려면 플레이어가 정확히 2명이어야 합니다.');
  }

  if (state.activePlayerId !== null) {
    throw new Error('이미 시작된 게임입니다.');
  }

  const preparedState = dealOpeningHands(prepareDecks(state, random));
  const firstPlayer = preparedState.players[0];
  const mediaRandom = random ?? defaultRandom;
  const backgroundId = mediaCatalog?.backgrounds.length
    ? mediaCatalog.backgrounds[Math.floor(mediaRandom() * mediaCatalog.backgrounds.length)]!.id
    : null;
  const bgmId = mediaCatalog?.bgms.length
    ? mediaCatalog.bgms[Math.floor(mediaRandom() * mediaCatalog.bgms.length)]!.id
    : null;

  const startedState: GameState = {
    ...preparedState,
    backgroundId,
    bgmId,
    turn: 1,
    activePlayerId: firstPlayer.id,
    status: 'IN_PROGRESS',
  };

  return processChampionQuestEvents(
    startedState,
    beginPlayerTurn(startedState, firstPlayer.id),
  );
}

export function endTurn(
  state: GameState,
  actingPlayerId: string,
): ActionResult {
  if (state.targetingState?.active) {
    return actionFailure(state, 'TARGET_SELECTION_PENDING', '먼저 대상을 선택하세요.');
  }
  const turnFailure = validateCurrentPlayer(state, actingPlayerId);
  if (turnFailure) {
    return turnFailure;
  }

  const currentPlayerIndex = state.players.findIndex(
    (player) => player.id === actingPlayerId,
  );
  const nextPlayerIndex = (currentPlayerIndex + 1) % state.players.length;
  const nextPlayer = state.players[nextPlayerIndex];

  const turnedState: GameState = {
    ...state,
    turn: state.turn + 1,
    activePlayerId: nextPlayer.id,
    players: state.players.map((player) => {
      if (player.id === actingPlayerId) {
        return {
          ...player,
          currentGold: 0,
          board: player.board.map((card) =>
            card ? { ...card, isStunned: false } : null,
          ) as typeof player.board,
        };
      }

      return player;
    }),
    events: [
      ...state.events,
      {
        type: 'TURN_ENDED',
        playerId: actingPlayerId,
        source: { type: 'PLAYER', playerId: actingPlayerId },
        target: { type: 'PLAYER', playerId: actingPlayerId },
        reason: 'END_TURN',
      },
      {
        type: 'GOLD_CHANGED',
        playerId: actingPlayerId,
        source: { type: 'SYSTEM' },
        target: { type: 'PLAYER', playerId: actingPlayerId },
        reason: 'TURN_ENDED',
        amount: -state.players[currentPlayerIndex].currentGold,
      },
    ],
  };

  const afterTurnEnd = state.players
    .find((player) => player.id === actingPlayerId)
    ?.board
    .filter((card): card is NonNullable<typeof card> => Boolean(card))
    .reduce((nextState, card) => {
      const currentCard = nextState.players
        .find((player) => player.id === actingPlayerId)
        ?.board.find((candidate) => candidate?.instanceId === card.instanceId);
      if (!currentCard) return nextState;
      const triggered = resolveTriggeredAbilities(nextState, actingPlayerId, currentCard, 'TURN_END');
      return triggered.targetingState?.active ? resolvePendingEffects(triggered) : triggered;
    }, turnedState) ?? turnedState;

  return actionSuccess(
    processChampionQuestEvents(
      afterTurnEnd,
      beginPlayerTurn(afterTurnEnd, nextPlayer.id),
    ),
  );
}