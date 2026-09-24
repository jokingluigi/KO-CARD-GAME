import type { CardInstanceId } from '../cards/types';
import type { ActionErrorCode, ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { GameState } from '../types/game-state';
import type { EventAttribution } from '../events/types';
import { validateCurrentPlayer } from './turn-system';
import {
  getDamageModifierBonus,
  hasKeyword,
  resolveBoardListeners,
  resolveStateBasedDeaths,
  resolvePendingEffects,
  resolveTriggeredAbilities,
  resolveRegisteredRuleListeners,
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

export type AttackLegality =
  | { allowed: true }
  | { allowed: false; reasonCode: ActionErrorCode; message: string };

export function getAttackLegality(
  state: GameState,
  playerId: string,
  cardInstanceId: CardInstanceId,
): AttackLegality {
  if (state.targetingState?.active) {
    return {
      allowed: false,
      reasonCode: 'TARGET_SELECTION_PENDING',
      message: '먼저 대상을 선택하세요.',
    };
  }
  if (state.activePlayerId !== playerId) {
    return {
      allowed: false,
      reasonCode: 'NOT_YOUR_TURN',
      message: '내 턴에만 공격할 수 있습니다.',
    };
  }
  if (state.status !== 'IN_PROGRESS') {
    return {
      allowed: false,
      reasonCode: 'GAME_NOT_IN_PROGRESS',
      message: '진행 중인 게임에서만 공격할 수 있습니다.',
    };
  }
  const entry = findBoardCard(state, playerId, cardInstanceId);
  if (!entry) {
    return {
      allowed: false,
      reasonCode: 'INVALID_ATTACK_TARGET',
      message: '공격할 수 없는 선수입니다.',
    };
  }
  if (entry.card.isStunned) {
    return {
      allowed: false,
      reasonCode: 'CARD_STUNNED',
      message: '기절한 선수는 공격할 수 없습니다.',
    };
  }

  const maximumAttacks = hasKeyword(entry.card, 'MULTI_STRIKE') ? 2 : 1;
  if (entry.card.attacksUsedThisTurn >= maximumAttacks) {
    return {
      allowed: false,
      reasonCode: 'ATTACK_ALREADY_USED',
      message: '이 선수는 이번 턴에 더 이상 공격할 수 없습니다.',
    };
  }

  if (
    entry.card.enteredThisTurn &&
    !hasKeyword(entry.card, 'RUSH') &&
    !hasKeyword(entry.card, 'SURPRISE')
  ) {
    return {
      allowed: false,
      reasonCode: 'SUMMONED_THIS_TURN',
      message: '이 선수는 이번 턴에 공격할 수 없습니다.',
    };
  }

  const opponent = state.players.find((player) => player.id !== playerId);
  const hasOpponentWrestler = Boolean(opponent?.board.some((card) => card !== null));
  const canAttackChampion = Boolean(
    opponent &&
      !isChampionProtectedByToken(state, opponent.id) &&
      (!entry.card.enteredThisTurn || !hasKeyword(entry.card, 'SURPRISE')),
  );
  if (!hasOpponentWrestler && !canAttackChampion) {
    return {
      allowed: false,
      reasonCode: 'NO_VALID_TARGET',
      message: '공격할 수 있는 대상이 없습니다.',
    };
  }

  return { allowed: true };
}

export function canSelectAsAttacker(
  state: GameState,
  playerId: string,
  cardInstanceId: CardInstanceId,
): boolean {
  return getAttackLegality(state, playerId, cardInstanceId).allowed;
}

function retireDefeatedWrestlers(
  state: GameState,
  causeEventStartIndex?: number,
): GameState {
  return resolveStateBasedDeaths(state, undefined, causeEventStartIndex);
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
    const preDamageTriggered = directChampion
      ? resolveTriggeredAbilities(state, target.playerId, directChampion, 'BEFORE_DAMAGE')
      : state;
    const preDamageState = preDamageTriggered !== state && preDamageTriggered.targetingState?.active
      ? resolvePendingEffects(preDamageTriggered)
      : preDamageTriggered;
    const preventedChampionDamage = Boolean(
      directChampion && preDamageState.preventedDamageTargetIds?.includes(directChampion.instanceId),
    );
    const directChampionDodges = Boolean(
      directChampion &&
      !preventedChampionDamage &&
      directChampion.dodgeAvailable &&
      hasKeyword(directChampion, 'DODGE'),
    );
    const damagedDirectChampion = directChampion
      ? preventedChampionDamage ? directChampion : receiveDamage(directChampion, attackerDamage)
      : null;
    const remainingHealth = damagedDirectChampion
      ? damagedDirectChampion.currentHealth
      : defendingPlayer.health - attackerDamage;
    const attackedState: GameState = {
      ...preDamageState,
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
           ...preDamageState.events,
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
           amount: directChampionDodges || preventedChampionDamage ? 0 : attackerDamage,
        },
      ],
    };

    const selfAttackResolved = resolveSelfAttackTrigger(
      attackedState, attackingPlayerId, attackerInstanceId,
    );
    const listenersResolved = resolveBoardListeners(
      selfAttackResolved, attackingPlayerId, 'OTHER_ALLY_ATTACK', { attackerInstanceId },
    );
    const damageListenersResolved = resolveRegisteredRuleListeners(
      { ...listenersResolved, preventedDamageTargetIds: undefined },
      'DAMAGE_TAKEN',
      target.playerId,
      damagedDirectChampion?.instanceId,
      damagedDirectChampion?.cardType,
    );
    if (directChampion) {
      const resolved = retireDefeatedWrestlers(damageListenersResolved);
      return actionSuccess(
        processChampionQuestEvents(
          state,
          resolved,
        ),
      );
    }
    if (remainingHealth > 0) {
      return actionSuccess(
        processChampionQuestEvents(state, damageListenersResolved),
      );
    }

    return actionSuccess(
      processChampionQuestEvents(state, {
        ...damageListenersResolved,
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
  const defenderBeforeDamage = resolveTriggeredAbilities(
    state,
    target.playerId,
    defender,
    'BEFORE_DAMAGE',
  );
  const defenderPrepared = defenderBeforeDamage !== state && defenderBeforeDamage.targetingState?.active
    ? resolvePendingEffects(defenderBeforeDamage)
    : defenderBeforeDamage;
  const attackerCurrent = findBoardCard(defenderPrepared, attackingPlayerId, attackerInstanceId)?.card ?? attacker;
  const defenderCurrent = findBoardCard(defenderPrepared, target.playerId, defender.instanceId)?.card ?? defender;
  const attackerBeforeDamage = resolveTriggeredAbilities(
    defenderPrepared,
    attackingPlayerId,
    attackerCurrent,
    'BEFORE_DAMAGE',
  );
  const preDamageState = attackerBeforeDamage !== defenderPrepared && attackerBeforeDamage.targetingState?.active
    ? resolvePendingEffects(attackerBeforeDamage)
    : attackerBeforeDamage;
  const attackerPrepared = findBoardCard(preDamageState, attackingPlayerId, attackerInstanceId)?.card ?? attackerCurrent;
  const defenderPreparedCard = findBoardCard(preDamageState, target.playerId, defender.instanceId)?.card ?? defenderCurrent;
  const preventedAttackerDamage = Boolean(preDamageState.preventedDamageTargetIds?.includes(defender.instanceId));
  const preventedDefenderDamage = Boolean(preDamageState.preventedDamageTargetIds?.includes(attackerInstanceId));
  const attackerDodges =
    !preventedDefenderDamage && attackerPrepared.dodgeAvailable && hasKeyword(attackerPrepared, 'DODGE');
  const defenderDodges =
    !preventedAttackerDamage && defenderPreparedCard.dodgeAvailable && hasKeyword(defenderPreparedCard, 'DODGE');

  const attackerDamage = attackerPrepared.currentAttack +
    getDamageModifierBonus(preDamageState, attackingPlayerId, attackerPrepared);
  const defenderDamage = defenderPreparedCard.currentAttack +
    getDamageModifierBonus(preDamageState, target.playerId, defenderPreparedCard);
  const damageEventStartIndex = preDamageState.events.length;
  const combatEventId = `combat:${state.gameId}:${state.turn}:${damageEventStartIndex}`;
  const attackerAttribution: EventAttribution = {
    sourcePlayerId: attackingPlayerId,
    sourceActionType: 'ATTACK',
    sourceEffectId: attackerPrepared.definitionId,
    rootSourceEventId: combatEventId,
    causationId: `${combatEventId}:${attackerInstanceId}`,
  };
  const defenderAttribution: EventAttribution = {
    sourcePlayerId: target.playerId,
    sourceActionType: 'ATTACK',
    sourceEffectId: defenderPreparedCard.definitionId,
    rootSourceEventId: combatEventId,
    causationId: `${combatEventId}:${defenderPreparedCard.instanceId}`,
  };
  const damagedState: GameState = {
    ...preDamageState,
    players: preDamageState.players.map((player) => ({
      ...player,
      board: player.board.map((card) => {
        if (card?.instanceId === attackerInstanceId) {
          return {
            ...(preventedDefenderDamage ? card : receiveDamage(card, defenderDamage)),
            attacksUsedThisTurn: card.attacksUsedThisTurn + 1,
          };
        }

        if (card?.instanceId === defender.instanceId) {
          return preventedAttackerDamage ? card : receiveDamage(card, attackerDamage);
        }

        return card;
      }) as typeof player.board,
    })),
    events: [
           ...preDamageState.events,
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
          amount: defenderDodges || preventedAttackerDamage ? 0 : attackerDamage,
        sourceContext: attackerAttribution,
      },
      {
        type: 'DAMAGE_DEALT',
        playerId: attackingPlayerId,
        cardInstanceId: attackerInstanceId,
        source: { type: 'CARD', cardInstanceId: defender.instanceId },
        target: { type: 'CARD', cardInstanceId: attackerInstanceId },
        reason: 'COMBAT',
          amount: attackerDodges || preventedDefenderDamage ? 0 : defenderDamage,
        sourceContext: defenderAttribution,
      },
    ],
  };

  const firstAttackedResolved = resolveTriggeredAbilities(
    damagedState,
    target.playerId,
    defenderPreparedCard,
    'FIRST_ATTACKED',
    { attackerInstanceId },
  );
  const exactZeroResolved = defenderDodges || preventedAttackerDamage || defenderPreparedCard.currentHealth - attackerDamage !== 0
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
  const damageListenersResolved = resolveRegisteredRuleListeners(
    { ...listenersResolved, preventedDamageTargetIds: undefined },
    'DAMAGE_TAKEN',
    target.playerId,
    defender.instanceId,
    defender.cardType,
  );
  const resolved = retireDefeatedWrestlers(
    damageListenersResolved,
    damageEventStartIndex,
  );
  return actionSuccess(processChampionQuestEvents(state, resolved));
}