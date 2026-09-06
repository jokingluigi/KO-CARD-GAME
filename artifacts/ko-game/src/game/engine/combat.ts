import type { CardInstanceId } from '../cards/types';
import type { RetireEvent } from '../events/types';
import type { GameState } from '../types/game-state';
import type { BoardSlot } from './board-position';
import { assertCurrentPlayer } from './turn-system';

export type AttackTarget =
  | {
      type: 'WRESTLER';
      playerId: string;
      cardInstanceId: CardInstanceId;
    }
  | {
      type: 'PLAYER';
      playerId: string;
    };

function findBoardCard(
  state: GameState,
  playerId: string,
  cardInstanceId: CardInstanceId,
) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const card = player?.board.find(
    (candidate) => candidate?.instanceId === cardInstanceId,
  );

  if (!player || !card) {
    throw new Error('필드에서 선수를 찾을 수 없습니다.');
  }

  return { player, card };
}

function retireDefeatedWrestlers(state: GameState): GameState {
  const retireEvents: RetireEvent[] = [];

  const players = state.players.map((player) => {
    const board = [...player.board];
    const retiredCards = [];

    for (let index = 0; index < board.length; index += 1) {
      const card = board[index];

      if (card && card.currentHealth <= 0) {
        retiredCards.push({ ...card, boardSlot: null });
        retireEvents.push({
          type: 'RETIRE',
          playerId: player.id,
          cardInstanceId: card.instanceId,
          boardSlot: index as BoardSlot,
        });
        board[index] = null;
      }
    }

    return {
      ...player,
      board: board as typeof player.board,
      graveyard: [...player.graveyard, ...retiredCards],
    };
  });

  return {
    ...state,
    players,
    events: [...state.events, ...retireEvents],
  };
}

export function attack(
  state: GameState,
  attackingPlayerId: string,
  attackerInstanceId: CardInstanceId,
  target: AttackTarget,
): GameState {
  assertCurrentPlayer(state, attackingPlayerId);

  if (state.status !== 'IN_PROGRESS') {
    throw new Error('진행 중인 게임에서만 공격할 수 있습니다.');
  }

  if (target.playerId === attackingPlayerId) {
    throw new Error('자신의 선수나 본체는 공격할 수 없습니다.');
  }

  const { card: attacker } = findBoardCard(
    state,
    attackingPlayerId,
    attackerInstanceId,
  );

  if (attacker.enteredThisTurn) {
    throw new Error('이번 턴에 등장한 선수는 공격할 수 없습니다.');
  }

  if (attacker.attacksUsedThisTurn >= 1) {
    throw new Error('이 선수는 이번 턴에 이미 공격했습니다.');
  }

  if (target.type === 'PLAYER') {
    const defendingPlayer = state.players.find(
      (player) => player.id === target.playerId,
    );

    if (!defendingPlayer) {
      throw new Error(`플레이어를 찾을 수 없습니다: ${target.playerId}`);
    }

    const remainingHealth = defendingPlayer.health - attacker.currentAttack;
    const attackedState: GameState = {
      ...state,
      players: state.players.map((player) => {
        if (player.id === attackingPlayerId) {
          return {
            ...player,
            board: player.board.map((card) =>
              card?.instanceId === attackerInstanceId
                ? {
                    ...card,
                    attacksUsedThisTurn: card.attacksUsedThisTurn + 1,
                  }
                : card,
            ) as typeof player.board,
          };
        }

        return player.id === target.playerId
          ? { ...player, health: remainingHealth }
          : player;
      }),
    };

    if (remainingHealth > 0) {
      return attackedState;
    }

    return {
      ...attackedState,
      status: 'FINISHED',
      activePlayerId: null,
      winnerId: attackingPlayerId,
      loserId: target.playerId,
    };
  }

  const { card: defender } = findBoardCard(
    state,
    target.playerId,
    target.cardInstanceId,
  );

  const damagedState: GameState = {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      board: player.board.map((card) => {
        if (card?.instanceId === attackerInstanceId) {
          return {
            ...card,
            currentHealth: card.currentHealth - defender.currentAttack,
            attacksUsedThisTurn: card.attacksUsedThisTurn + 1,
          };
        }

        if (card?.instanceId === defender.instanceId) {
          return {
            ...card,
            currentHealth: card.currentHealth - attacker.currentAttack,
          };
        }

        return card;
      }) as typeof player.board,
    })),
  };

  return retireDefeatedWrestlers(damagedState);
}