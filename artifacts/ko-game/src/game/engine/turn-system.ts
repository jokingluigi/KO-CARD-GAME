import type { GameState, PlayerState } from '../types/game-state';
import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { RandomSource } from '../random/random';
import { MAX_DECK_SIZE, MIN_DECK_SIZE } from '../rules/constants';
import { drawCard } from './draw-card';
import { shuffle } from '../random/random';

function beginPlayerTurn(state: GameState, playerId: string): GameState {
  const player = state.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    throw new Error(`플레이어를 찾을 수 없습니다: ${playerId}`);
  }

  const personalTurn = player.personalTurn + 1;

  const currentGold = personalTurn + player.nextTurnGoldBonus;
  const turnStartedState: GameState = {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? {
            ...candidate,
            personalTurn,
            currentGold,
            nextTurnGoldBonus: 0,
            board: candidate.board.map((card) =>
              card
                ? {
                    ...card,
                    enteredThisTurn: false,
                    attacksUsedThisTurn: 0,
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

  return drawCard(turnStartedState, playerId);
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
): GameState {
  if (state.players.length !== 2) {
    throw new Error('게임을 시작하려면 플레이어가 정확히 2명이어야 합니다.');
  }

  if (state.activePlayerId !== null) {
    throw new Error('이미 시작된 게임입니다.');
  }

  const preparedState = dealOpeningHands(prepareDecks(state, random));
  const firstPlayer = preparedState.players[0];

  const startedState: GameState = {
    ...preparedState,
    turn: 1,
    activePlayerId: firstPlayer.id,
    status: 'IN_PROGRESS',
  };

  return beginPlayerTurn(startedState, firstPlayer.id);
}

export function endTurn(
  state: GameState,
  actingPlayerId: string,
): ActionResult {
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
        return { ...player, currentGold: 0 };
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

  return actionSuccess(beginPlayerTurn(turnedState, nextPlayer.id));
}