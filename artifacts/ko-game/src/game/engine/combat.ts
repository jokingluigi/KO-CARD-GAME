import type { CardInstanceId } from '../cards/types';
import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { RetireEvent } from '../events/types';
import type { GameState } from '../types/game-state';
import type { BoardSlot } from './board-position';
import { validateCurrentPlayer } from './turn-system';
import {
  hasKeyword,
  resolveTriggeredAbilities,
} from '../effects/effect-engine';
import { processChampionQuestEvents } from '../champions/quests';
import { findDirectDeployedChampion } from './direct-champion';

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

export function canSelectAsAttacker(
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
  const entry = findBoardCard(state, playerId, cardInstanceId);
  if (!entry || entry.card.isStunned) return false;

  const maximumAttacks = hasKeyword(entry.card, 'MULTI_STRIKE') ? 2 : 1;
  if (entry.card.attacksUsedThisTurn >= maximumAttacks) return false;

  return (
    !entry.card.enteredThisTurn ||
    hasKeyword(entry.card, 'RUSH') ||
    hasKeyword(entry.card, 'SURPRISE')
  );
}

function retireDefeatedWrestlers(state: GameState): GameState {
  const retireEvents: RetireEvent[] = [];
  const retired: Array<{
    playerId: string;
    card: NonNullable<GameState['players'][number]['board'][number]>;
  }> = [];

  const players = state.players.map((player) => {
    const board = [...player.board];
    const retiredCards = [];

    for (let index = 0; index < board.length; index += 1) {
      const card = board[index];

      if (card && card.currentHealth <= 0) {
        retired.push({ playerId: player.id, card });
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

  const directChampionLoser = retired.find(
    (entry) => entry.card.isDirectDeployedChampion,
  )?.playerId;
  const retiredState: GameState = {
    ...state,
    players,
    events: [...state.events, ...retireEvents],
    ...(directChampionLoser
      ? {
          status: 'FINISHED' as const,
          activePlayerId: null,
          winnerId:
            state.players.find(
              (player) => player.id !== directChampionLoser,
            )?.id ?? null,
          loserId: directChampionLoser,
        }
      : {}),
  };

  return retired.reduce(
    (nextState, entry) =>
      resolveTriggeredAbilities(
        nextState,
        entry.playerId,
        entry.card,
        'LEAVE_FIELD',
        { leaveReason: 'RETIRE' },
      ),
    retiredState,
  );
}

function receiveDamage(
  card: NonNullable<GameState['players'][number]['board'][number]>,
  amount: number,
) {
  if (
    amount > 0 &&
    card.dodgeAvailable &&
    hasKeyword(card, 'DODGE')
  ) {
    return { ...card, dodgeAvailable: false };
  }

  return { ...card, currentHealth: card.currentHealth - amount };
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

  if (attacker.isStunned) {
    return actionFailure(state, 'CARD_STUNNED', '기절한 선수는 공격할 수 없습니다.');
  }

  const canAttackOnEntry =
    hasKeyword(attacker, 'RUSH') ||
    (hasKeyword(attacker, 'SURPRISE') && target.type === 'WRESTLER');
  if (attacker.enteredThisTurn && !canAttackOnEntry) {
    return actionFailure(
      state,
      'SUMMONED_THIS_TURN',
      '이 선수는 이번 턴에 공격할 수 없습니다.',
    );
  }

  const maximumAttacks = hasKeyword(attacker, 'MULTI_STRIKE') ? 2 : 1;
  if (attacker.attacksUsedThisTurn >= maximumAttacks) {
    return actionFailure(
      state,
      'ATTACK_ALREADY_USED',
      '이 선수는 이번 턴에 더 이상 공격할 수 없습니다.',
    );
  }

  const defendingPlayer = state.players.find(
    (player) => player.id === target.playerId,
  );
  const tauntCards =
    defendingPlayer?.board.filter(
      (card): card is NonNullable<typeof card> =>
        card !== null && hasKeyword(card, 'TAUNT'),
    ) ?? [];
  if (
    tauntCards.length > 0 &&
    (target.type !== 'WRESTLER' ||
      !tauntCards.some(
        (card) => card.instanceId === target.cardInstanceId,
      ))
  ) {
    return actionFailure(
      state,
      'TAUNT_TARGET_REQUIRED',
      '도발 선수를 먼저 공격해야 합니다.',
    );
  }

  if (target.type === 'PLAYER') {
    if (!defendingPlayer) {
      return actionFailure(
        state,
        'INVALID_ATTACK_TARGET',
        '해당 대상을 공격할 수 없습니다.',
      );
    }

    const directChampion = findDirectDeployedChampion(
      state,
      target.playerId,
    );
    const damagedDirectChampion = directChampion
      ? receiveDamage(directChampion, attacker.currentAttack)
      : null;
    const remainingHealth = damagedDirectChampion
      ? damagedDirectChampion.currentHealth
      : defendingPlayer.health - attacker.currentAttack;
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
          ? {
              ...player,
              ...(damagedDirectChampion
                ? {
                    board: player.board.map((card) =>
                      card?.instanceId === damagedDirectChampion.instanceId
                        ? damagedDirectChampion
                        : card,
                    ) as typeof player.board,
                  }
                : {
                    health: remainingHealth,
                    champion: player.champion
                      ? { ...player.champion, health: remainingHealth }
                      : null,
                  }),
            }
          : player;
      }),
      events: [
        ...state.events,
        {
          type: 'ATTACK_DECLARED',
          playerId: attackingPlayerId,
          cardInstanceId: attackerInstanceId,
          source: { type: 'CARD', cardInstanceId: attackerInstanceId },
          target: damagedDirectChampion
            ? {
                type: 'CARD',
                cardInstanceId: damagedDirectChampion.instanceId,
              }
            : { type: 'PLAYER', playerId: target.playerId },
          reason: 'BASIC_ATTACK',
        },
        {
          type: 'DAMAGE_DEALT',
          playerId: attackingPlayerId,
          cardInstanceId: attackerInstanceId,
          source: { type: 'CARD', cardInstanceId: attackerInstanceId },
          target: damagedDirectChampion
            ? {
                type: 'CARD',
                cardInstanceId: damagedDirectChampion.instanceId,
              }
            : { type: 'PLAYER', playerId: target.playerId },
          reason: 'BASIC_ATTACK',
          amount: attacker.currentAttack,
        },
      ],
    };

    if (directChampion) {
      return actionSuccess(
        processChampionQuestEvents(
          state,
          retireDefeatedWrestlers(attackedState),
        ),
      );
    }

    if (remainingHealth > 0) {
      return actionSuccess(
        processChampionQuestEvents(state, attackedState),
      );
    }

    return actionSuccess(
      processChampionQuestEvents(state, {
        ...attackedState,
        status: 'FINISHED',
        activePlayerId: null,
        winnerId: attackingPlayerId,
        loserId: target.playerId,
      }),
    );
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
  const attackerDodges =
    attacker.dodgeAvailable && hasKeyword(attacker, 'DODGE');
  const defenderDodges =
    defender.dodgeAvailable && hasKeyword(defender, 'DODGE');

  const damagedState: GameState = {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      board: player.board.map((card) => {
        if (card?.instanceId === attackerInstanceId) {
          return {
            ...receiveDamage(card, defender.currentAttack),
            attacksUsedThisTurn: card.attacksUsedThisTurn + 1,
          };
        }

        if (card?.instanceId === defender.instanceId) {
          return receiveDamage(card, attacker.currentAttack);
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
        amount: defenderDodges ? 0 : attacker.currentAttack,
      },
      {
        type: 'DAMAGE_DEALT',
        playerId: attackingPlayerId,
        cardInstanceId: attackerInstanceId,
        source: { type: 'CARD', cardInstanceId: defender.instanceId },
        target: { type: 'CARD', cardInstanceId: attackerInstanceId },
        reason: 'COMBAT',
        amount: attackerDodges ? 0 : defender.currentAttack,
      },
    ],
  };

  return actionSuccess(
    processChampionQuestEvents(
      state,
      retireDefeatedWrestlers(damagedState),
    ),
  );
}