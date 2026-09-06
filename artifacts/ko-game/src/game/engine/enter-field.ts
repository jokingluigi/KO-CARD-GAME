import type { CardInstance } from '../cards/types';
import type { EnterFieldEvent, EventSubject } from '../events/types';
import type { GameState } from '../types/game-state';
import type { BoardSlot } from './board-position';
import { resolveTriggeredAbilities } from '../effects/effect-engine';

export function enterField(
  state: GameState,
  playerId: string,
  card: CardInstance,
  boardSlot: BoardSlot,
  source: EventSubject = {
    type: 'CARD',
    cardInstanceId: card.instanceId,
  },
): GameState {
  const player = state.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    throw new Error(`플레이어를 찾을 수 없습니다: ${playerId}`);
  }

  if (player.board[boardSlot] !== null) {
    throw new Error(`이미 사용 중인 보드 슬롯입니다: ${boardSlot}`);
  }

  const enteredCard: CardInstance = {
    ...card,
    boardSlot,
    enteredThisTurn: true,
    attacksUsedThisTurn: 0,
  };
  const event: EnterFieldEvent = {
    type: 'ENTER_FIELD',
    playerId,
    cardInstanceId: card.instanceId,
    boardSlot,
    source,
    target: { type: 'CARD', cardInstanceId: card.instanceId },
    reason: 'ENTER_FIELD',
  };

  const enteredState: GameState = {
    ...state,
    players: state.players.map((candidate) => {
      if (candidate.id !== playerId) {
        return candidate;
      }

      const board = [...candidate.board];
      board[boardSlot] = enteredCard;

      return {
        ...candidate,
        board: board as typeof candidate.board,
      };
    }),
    events: [...state.events, event],
  };

  const afterEnter = resolveTriggeredAbilities(
    enteredState,
    playerId,
    enteredCard,
    'ENTER_FIELD',
    { boardSlot },
  );
  return resolveTriggeredAbilities(
    afterEnter,
    playerId,
    enteredCard,
    'POSITION',
    { boardSlot },
  );
}