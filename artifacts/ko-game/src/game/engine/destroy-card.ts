import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { CardInstanceId } from '../cards/types';
import type { EventAttribution } from '../events/types';
import type { GameState } from '../types/game-state';

export interface DestroyCardProvenance {
  sourceInstanceId?: CardInstanceId;
  sourceContext?: EventAttribution;
}

export function destroyCard(
  state: GameState,
  playerId: string,
  cardInstanceId: CardInstanceId,
  provenance: DestroyCardProvenance = {},
): ActionResult {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const card = player?.board.find(
    (candidate) => candidate?.instanceId === cardInstanceId,
  );
  if (!player || !card) {
    return actionFailure(
      state,
      'INVALID_ATTACK_TARGET',
      '파괴할 수 없는 선수입니다.',
    );
  }
  if (card.isDirectDeployedChampion || card.isTrainingDummy) {
    return actionFailure(
      state,
      'DIRECT_CHAMPION_CANNOT_BE_DESTROYED',
      '직접 출전한 챔피언은 효과로 파괴할 수 없습니다.',
    );
  }

  const board = [...player.board];
  board[card.boardSlot!] = null;
  const destroyedState: GameState = {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? {
            ...candidate,
            board: board as typeof candidate.board,
          }
        : candidate,
    ),
    events: [
      ...state.events,
      {
        type: 'CARD_DESTROYED',
        playerId,
        cardInstanceId,
        cardType: card.cardType ?? 'WRESTLER',
        source: provenance.sourceInstanceId
          ? { type: 'CARD', cardInstanceId: provenance.sourceInstanceId }
          : { type: 'SYSTEM' },
        target: { type: 'CARD', cardInstanceId },
        reason: 'DESTROY',
        boardSlot: card.boardSlot!,
        targetSnapshot: {
          playerId,
          cardInstanceId: card.instanceId,
          cardType: card.cardType ?? 'WRESTLER',
          boardSlot: card.boardSlot!,
          currentAttack: card.currentAttack,
          currentHealth: card.currentHealth,
        },
        ...(provenance.sourceContext
          ? { sourceContext: provenance.sourceContext }
          : {}),
      },
    ],
  };

  return actionSuccess(destroyedState);
}
