import type { CardInstanceId } from '../cards/types';
import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { RetireEvent } from '../events/types';
import type { GameState } from '../types/game-state';
import type { BoardSlot } from './board-position';
import { validateCurrentPlayer } from './turn-system';
import {
  getDamageModifierBonus,
  hasKeyword,
  resolveBoardListeners,
  resolveCardRetiredListeners,
  resolveTriggeredAbilities,
} from '../effects/effect-engine';
import { processChampionQuestEvents } from '../champions/quests';
import { findDirectDeployedChampion, isChampionProtectedByToken } from './direct-champion';

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
          cardType: card.cardType,
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

  return retired.reduce((nextState, entry) => {
    const withLeaveEffect = resolveTriggeredAbilities(
      nextState,
      entry.playerId,
      entry.card,
      'LEAVE_FIELD',
      { leaveReason: 'RETIRE' },
    );
    return resolveCardRetiredListeners(withLeaveEffect, entry.playerId, entry.card);
  }, retiredState);
}

function receiveDamage(
  card: NonNullable<GameState['players'][number]['board'][number]>,
  amount: number,
) {
  const dodgeCharges = Math.max(
    card.dodgeCharges ?? 0,
    card.dodgeAvailable ? 1 : 0,
  );
  if (
    amount > 0 &&
    dodgeCharges > 0 &&
    hasKeyword(card, 'DODGE')
  ) {
    return {
      ...card,
      dodgeAvailable: dodgeCharges > 1,
      dodgeCharges: dodgeCharges - 1,
    };
  }

  return { ...card, currentHealth: card.currentHealth - amount };
}

function resolveSelfAttackTrigger(
  state: GameState,
  playerId: string,
  attackerInstanceId: CardInstanceId,
): GameState {
  const attacker = findBoardCard(state, playerId, attackerInstanceId)?.card;
  return attacker
    ? resolveTriggeredAbilities(state, playerId, attacker, 'SELF_ATTACK', {
        attackerInstanceId,
      })
    : state;
}

export function attack(
  state: GameState,
  attackingPlayerId: string,
  attackerInstanceId: CardInstanceId,
  target: AttackTarget,
): ActionResult {
  if (state.targetingState?.active) {
    return actionFailure(state, 'TARGET_SELECTION_PENDING', '먼저 대상을 선택하세요.');
  }
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
    if (isChampionProtectedByToken(state, target.playerId)) {
      return actionFailure(
        state,
        'INVALID_ATTACK_TARGET',
        '챔피언 토큰이 활성화된 동안 챔피언 본체를 공격할 수 없습니다.',
      );
    }

    const directChampion = findDirectDeployedChampion(
      state,
      target.playerId,
    );
    const attackerDamage = attacker.currentAttack +
      getDamageModifierBonus(state, attackingPlayerId, attacker);
    const directChampionDodges = Boolean(
      directChampion &&
      directChampion.dodgeAvailable &&
      hasKeyword(directChampion, 'DODGE'),
    );
    const damagedDirectChampion = directChampion
      ? receiveDamage(directChampion, attackerDamage)
      : null;
    const remainingHealth = damagedDirectChampion
      ? damagedDirectChampion.currentHealth
      : defendingPlayer.health - attackerDamage;
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
          reason: directChampionDodges ? 'DODGE' : 'BASIC_ATTACK',
          sourceSnapshot: {
            playerId: attackingPlayerId,
            cardInstanceId: attacker.instanceId,
            cardType: attacker.cardType ?? 'WRESTLER',
            boardSlot: attacker.boardSlot,
            currentAttack: attacker.currentAttack,
            currentHealth: attacker.currentHealth,
          },
          ...(damagedDirectChampion ? {
            targetSnapshot: {
              playerId: target.playerId,
              cardInstanceId: damagedDirectChampion.instanceId,
              cardType: damagedDirectChampion.cardType ?? 'WRESTLER',
              boardSlot: damagedDirectChampion.boardSlot,
              currentAttack: damagedDirectChampion.currentAttack,
              currentHealth: damagedDirectChampion.currentHealth,
            },
          } : {}),
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
          reason: directChampionDodges ? 'DODGE' : 'BASIC_ATTACK',
          amount: directChampionDodges ? 0 : attackerDamage,
        },
      ],
    };

    const selfAttackResolved = resolveSelfAttackTrigger(
      attackedState, attackingPlayerId, attackerInstanceId,
    );
    const listenersResolved = resolveBoardListeners(
      selfAttackResolved, attackingPlayerId, 'OTHER_ALLY_ATTACK', { attackerInstanceId },
    );
    if (directChampion) {
      return actionSuccess(
        processChampionQuestEvents(
          state,
          retireDefeatedWrestlers(listenersResolved),
        ),
      );
    }

    if (remainingHealth > 0) {
      return actionSuccess(
        processChampionQuestEvents(state, listenersResolved),
      );
    }

    return actionSuccess(
      processChampionQuestEvents(state, {
        ...listenersResolved,
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

  const attackerDamage = attacker.currentAttack +
    getDamageModifierBonus(state, attackingPlayerId, attacker);
  const defenderDamage = defender.currentAttack +
    getDamageModifierBonus(state, target.playerId, defender);
  const damagedState: GameState = {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      board: player.board.map((card) => {
        if (card?.instanceId === attackerInstanceId) {
          return {
            ...receiveDamage(card, defenderDamage),
            attacksUsedThisTurn: card.attacksUsedThisTurn + 1,
          };
        }

        if (card?.instanceId === defender.instanceId) {
          return receiveDamage(card, attackerDamage);
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
        sourceSnapshot: {
          playerId: attackingPlayerId,
          cardInstanceId: attacker.instanceId,
          cardType: attacker.cardType ?? 'WRESTLER',
          boardSlot: attacker.boardSlot,
          currentAttack: attacker.currentAttack,
          currentHealth: attacker.currentHealth,
        },
        targetSnapshot: {
          playerId: target.playerId,
          cardInstanceId: defender.instanceId,
          cardType: defender.cardType ?? 'WRESTLER',
          boardSlot: defender.boardSlot,
          currentAttack: defender.currentAttack,
          currentHealth: defender.currentHealth,
        },
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
          amount: defenderDodges ? 0 : attackerDamage,
      },
      {
        type: 'DAMAGE_DEALT',
        playerId: attackingPlayerId,
        cardInstanceId: attackerInstanceId,
        source: { type: 'CARD', cardInstanceId: defender.instanceId },
        target: { type: 'CARD', cardInstanceId: attackerInstanceId },
        reason: 'COMBAT',
          amount: attackerDodges ? 0 : defenderDamage,
      },
    ],
  };

  const firstAttackedResolved = resolveTriggeredAbilities(
    damagedState,
    target.playerId,
    defender,
    'FIRST_ATTACKED',
    { attackerInstanceId },
  );
  const exactZeroResolved = defenderDodges || defender.currentHealth - attackerDamage !== 0
    ? firstAttackedResolved
    : resolveTriggeredAbilities(firstAttackedResolved, attackingPlayerId, attacker, 'EXACT_ZERO_DAMAGE', {
      damagedTargetInstanceId: defender.instanceId, healthBefore: defender.currentHealth, healthAfter: 0,
    });
  const attackerAfterDamage = findBoardCard(exactZeroResolved, attackingPlayerId, attackerInstanceId)?.card;
  const attackSurvivedResolved = attackerAfterDamage && attackerAfterDamage.currentHealth > 0
    ? resolveTriggeredAbilities(exactZeroResolved, attackingPlayerId, attackerAfterDamage, 'ATTACK_SURVIVED', {
      attackerInstanceId,
      damagedTargetInstanceId: defender.instanceId,
    })
    : exactZeroResolved;
  const selfAttackResolved = resolveSelfAttackTrigger(
    attackSurvivedResolved, attackingPlayerId, attackerInstanceId,
  );
  const listenersResolved = resolveBoardListeners(
    selfAttackResolved, attackingPlayerId, 'OTHER_ALLY_ATTACK', { attackerInstanceId },
  );
  return actionSuccess(
    processChampionQuestEvents(
      state,
      retireDefeatedWrestlers(listenersResolved),
    ),
  );
}