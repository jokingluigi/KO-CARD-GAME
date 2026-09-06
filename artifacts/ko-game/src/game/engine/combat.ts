import type { CardInstanceId } from '../cards/types';
import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { RetireEvent } from '../events/types';
import type { GameState } from '../types/game-state';
import type { BoardSlot } from './board-position';
import { validateCurrentPlayer } from './turn-system';

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

  return player && card ? { player, card } : null;
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
          type: 'CARD_RETIRED',
          playerId: player.id,
          cardInstanceId: card.instanceId,
          boardSlot: index as BoardSlot,
          source: { type: 'SYSTEM' },
          target: { type: 'CARD', cardInstanceId: card.instanceId },
          reason: 'RETIRE',
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
): ActionResult {
  const turnFailure = validateCurrentPlayer(state, attackingPlayerId);
  if (turnFailure) {
    return turnFailure;
  }

  if (state.status !== 'IN_PROGRESS') {
    return actionFailure(
      state,
      'GAME_NOT_IN_PROGRESS',
      '진행 중인 게임에서만 공격할 수 있습니다.',
    );
  }

  if (target.playerId === attackingPlayerId) {
    return actionFailure(
      state,
      'INVALID_ATTACK_TARGET',
      '해당 대상을 공격할 수 없습니다.',
    );
  }

  const attackerEntry = findBoardCard(
    state,
    attackingPlayerId,
    attackerInstanceId,
  );
  if (!attackerEntry) {
    return actionFailure(
      state,
      'INVALID_ATTACK_TARGET',
      '공격할 수 없는 선수입니다.',
    );
  }
  const { card: attacker } = attackerEntry;

  if (attacker.enteredThisTurn) {
    return actionFailure(
      state,
      'SUMMONED_THIS_TURN',
      '이 선수는 이번 턴에 공격할 수 없습니다.',
    );
  }

  if (attacker.attacksUsedThisTurn >= 1) {
    return actionFailure(
      state,
      'ATTACK_ALREADY_USED',
      '이 선수는 이번 턴에 더 이상 공격할 수 없습니다.',
    );
  }

  if (target.type === 'PLAYER') {
    const defendingPlayer = state.players.find(
      (player) => player.id === target.playerId,
    );

    if (!defendingPlayer) {
      return actionFailure(
        state,
        'INVALID_ATTACK_TARGET',
        '해당 대상을 공격할 수 없습니다.',
      );
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
      events: [
        ...state.events,
        {
          type: 'ATTACK_DECLARED',
          playerId: attackingPlayerId,
          cardInstanceId: attackerInstanceId,
          source: { type: 'CARD', cardInstanceId: attackerInstanceId },
          target: { type: 'PLAYER', playerId: target.playerId },
          reason: 'BASIC_ATTACK',
        },
        {
          type: 'DAMAGE_DEALT',
          playerId: attackingPlayerId,
          cardInstanceId: attackerInstanceId,
          source: { type: 'CARD', cardInstanceId: attackerInstanceId },
          target: { type: 'PLAYER', playerId: target.playerId },
          reason: 'BASIC_ATTACK',
          amount: attacker.currentAttack,
        },
      ],
    };

    if (remainingHealth > 0) {
      return actionSuccess(attackedState);
    }

    return actionSuccess({
      ...attackedState,
      status: 'FINISHED',
      activePlayerId: null,
      winnerId: attackingPlayerId,
      loserId: target.playerId,
    });
  }

  const defenderEntry = findBoardCard(
    state,
    target.playerId,
    target.cardInstanceId,
  );
  if (!defenderEntry) {
    return actionFailure(
      state,
      'INVALID_ATTACK_TARGET',
      '해당 대상을 공격할 수 없습니다.',
    );
  }
  const { card: defender } = defenderEntry;

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
    events: [
      ...state.events,
      {
        type: 'ATTACK_DECLARED',
        playerId: attackingPlayerId,
        cardInstanceId: attackerInstanceId,
        source: { type: 'CARD', cardInstanceId: attackerInstanceId },
        target: {
          type: 'CARD',
          cardInstanceId: defender.instanceId,
        },
        reason: 'BASIC_ATTACK',
      },
      {
        type: 'DAMAGE_DEALT',
        playerId: target.playerId,
        cardInstanceId: defender.instanceId,
        source: { type: 'CARD', cardInstanceId: attackerInstanceId },
        target: {
          type: 'CARD',
          cardInstanceId: defender.instanceId,
        },
        reason: 'COMBAT',
        amount: attacker.currentAttack,
      },
      {
        type: 'DAMAGE_DEALT',
        playerId: attackingPlayerId,
        cardInstanceId: attackerInstanceId,
        source: { type: 'CARD', cardInstanceId: defender.instanceId },
        target: { type: 'CARD', cardInstanceId: attackerInstanceId },
        reason: 'COMBAT',
        amount: defender.currentAttack,
      },
    ],
  };

  return actionSuccess(retireDefeatedWrestlers(damagedState));
}