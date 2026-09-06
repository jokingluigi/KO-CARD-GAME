import type { GameState } from '../types/game-state';
import type { CardInstanceId } from '../cards/types';
import type { BoardSlot } from './board-position';
import { isBoardFull } from './board-position';
import { enterField } from './enter-field';
import { assertCurrentPlayer } from './turn-system';

export function playWrestlerFromHand(
  state: GameState,
  playerId: string,
  cardInstanceId: CardInstanceId,
  boardSlot: BoardSlot,
): GameState {
  assertCurrentPlayer(state, playerId);

  const player = state.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    throw new Error(`플레이어를 찾을 수 없습니다: ${playerId}`);
  }

  const card = player.hand.find(
    (candidate) => candidate.instanceId === cardInstanceId,
  );

  if (!card) {
    throw new Error('손패에서 선수를 찾을 수 없습니다.');
  }

  if (isBoardFull(player.board)) {
    throw new Error('보드가 가득 차 선수를 낼 수 없습니다.');
  }

  if (player.board[boardSlot] !== null) {
    throw new Error('선택한 보드 슬롯이 비어 있지 않습니다.');
  }

  if (player.currentGold < card.currentCost) {
    throw new Error('골드가 부족합니다.');
  }

  const paidState: GameState = {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? {
            ...candidate,
            currentGold: candidate.currentGold - card.currentCost,
            hand: candidate.hand.filter(
              (handCard) => handCard.instanceId !== cardInstanceId,
            ),
          }
        : candidate,
    ),
  };

  return enterField(paidState, playerId, card, boardSlot);
}