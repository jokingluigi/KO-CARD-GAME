import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { CardInstanceId } from '../cards/types';
import { getActiveAbility, resolveActiveAbility } from '../effects/effect-engine';
import type { GameState } from '../types/game-state';
import { validateCurrentPlayer } from './turn-system';

function updateBoardCard(
  state: GameState,
  cardInstanceId: CardInstanceId,
  update: (card: NonNullable<GameState['players'][number]['board'][number]>) =>
    NonNullable<GameState['players'][number]['board'][number]>,
): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      board: player.board.map((card) =>
        card?.instanceId === cardInstanceId ? update(card) : card,
      ) as typeof player.board,
    })),
  };
}

export function silenceCard(
  state: GameState,
  cardInstanceId: CardInstanceId,
): GameState {
  return updateBoardCard(state, cardInstanceId, (card) =>
    card.isSilenceImmune
      ? card
      : {
          ...card,
          isSilenced: true,
          dodgeAvailable: false,
        },
  );
}

export function setCardStunned(
  state: GameState,
  cardInstanceId: CardInstanceId,
  isStunned: boolean,
): GameState {
  return updateBoardCard(state, cardInstanceId, (card) => ({
    ...card,
    isStunned,
  }));
}

export function useActiveAbility(
  state: GameState,
  playerId: string,
  cardInstanceId: CardInstanceId,
): ActionResult {
  const turnFailure = validateCurrentPlayer(state, playerId);
  if (turnFailure) return turnFailure;

  const player = state.players.find((candidate) => candidate.id === playerId);
  const card = player?.board.find(
    (candidate) => candidate?.instanceId === cardInstanceId,
  );

  if (!card || !getActiveAbility(card)) {
    return actionFailure(
      state,
      'ACTIVE_NOT_AVAILABLE',
      '사용할 수 있는 액티브 능력이 없습니다.',
    );
  }
  if (card.isStunned) {
    return actionFailure(state, 'CARD_STUNNED', '기절한 선수입니다.');
  }
  if (card.activeUsedThisTurn) {
    return actionFailure(
      state,
      'ACTIVE_ALREADY_USED',
      '이번 턴에는 이미 액티브 능력을 사용했습니다.',
    );
  }

  const resolved = resolveActiveAbility(state, playerId, card);
  return actionSuccess(
    updateBoardCard(resolved, cardInstanceId, (candidate) => ({
      ...candidate,
      activeUsedThisTurn: true,
    })),
  );
}

export function canUseActiveAbility(
  state: GameState,
  playerId: string,
  cardInstanceId: CardInstanceId,
): boolean {
  if (
    state.status !== 'IN_PROGRESS' ||
    state.activePlayerId !== playerId
  ) {
    return false;
  }
  const player = state.players.find((candidate) => candidate.id === playerId);
  const card = player?.board.find(
    (candidate) => candidate?.instanceId === cardInstanceId,
  );
  return Boolean(
    card &&
      !card.isStunned &&
      !card.activeUsedThisTurn &&
      getActiveAbility(card),
  );
}