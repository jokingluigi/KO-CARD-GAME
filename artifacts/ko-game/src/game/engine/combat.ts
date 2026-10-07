import { hasNewCardRule, silenceDamageReduction, madokawaIncomingBonus } from './new-card-rules';
import { keywordDamage, healLifesteal, hasEntryDefense } from './keyword-rules';
import type { CardInstanceId } from '../cards/types';
import type { ActionErrorCode, ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { GameState } from '../types/game-state';
import type { EventAttribution } from '../events/types';
import { validateCurrentPlayer } from './turn-system';
import {
  applyEffect,
  getDamageModifierBonus,
  hasKeyword,
  resolveBoardListeners,
  resolveStateBasedDeaths,
  resolvePendingEffects,
  resolveTriggeredAbilities,
  resolveRegisteredRuleListeners,
} from '../effects/effect-engine';
import { processChampionQuestEvents } from '../champions/quests';
import { checkpointAwakening, hasAwakeningInvulnerability, hasAwakeningPassive, prepareAwakeningCounter, resolveAwakeningCounter } from '../champions/awakening';
import { findDirectDeployedChampion, isChampionProtectedByToken } from './direct-champion';
import { towerAttackBlocked, towerCombatAttackBonus, towerIncomingDamage } from '../tower/relics';

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
  if (towerAttackBlocked(state, playerId, cardInstanceId)) return { allowed: false, reasonCode: 'SUMMONED_THIS_TURN', message: '폭주 티켓으로 소환한 선수는 이번 턴에 공격할 수 없습니다.' };

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
  if (card.isTrainingDummy) return { ...card, currentHealth: 1 };
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
  const actionStartState = state;
  if (state.targetingState?.active) {
    return actionFailure(state, 'TARGET_SELECTION_PENDING', '먼저 대상을 선택하세요.');
  }
  const retireAfterAttack = state.players.find(p=>p.id===attackingPlayerId)?.board.some(c=>hasNewCardRule(c,'마도카와') && /공격\s*이후.*리타이어/u.test((c!.grantedText?.rulesText ?? state.cardPool?.find(d=>d.id===c!.definitionId)?.rulesText ?? ''))) ?? false;
  const finishNewAttack = (next:GameState):GameState => {
    const c=findBoardCard(next,attackingPlayerId,attackerInstanceId)?.card;
    if(!retireAfterAttack || !c || c.cardType!=='WRESTLER') return next;
    const retired=applyEffect(next,attackingPlayerId,c,{type:'STRUCTURED',action:'RETIRE',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1}});
    return retired.targetingState?.active ? resolvePendingEffects(retired) : retired;
  };
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
  if (towerAttackBlocked(state, attackingPlayerId, attackerInstanceId)) return actionFailure(state, 'SUMMONED_THIS_TURN', '폭주 티켓으로 소환한 선수는 이번 턴에 공격할 수 없습니다.');

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
  if (target.type === 'WRESTLER') {
    const selected = defendingPlayer?.board.find(c => c?.instanceId === target.cardInstanceId);
    if (selected && hasEntryDefense(selected, state.turn)) return actionFailure(state, 'INVALID_ATTACK_TARGET', '방어 중인 선수는 다음 자기 턴 시작까지 공격할 수 없습니다.');
  }
  const tauntCards =
    defendingPlayer?.board.filter(
      (card): card is NonNullable<typeof card> =>
        card !== null && hasKeyword(card, 'TAUNT') && !(hasEntryDefense(card, state.turn)),
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
    const awakeningPrevented = hasAwakeningInvulnerability(state, target.playerId);
    const attackerDamage = awakeningPrevented ? 0 : attacker.currentAttack +
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
    const attackedState: GameState = healLifesteal({
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
    }, attackingPlayerId, attacker, preventedChampionDamage || directChampionDodges ? 0 : attackerDamage);

    const recordedAttack = awakeningPrevented
      ? { ...attackedState, events: attackedState.events.filter((event, index) => index < preDamageState.events.length || event.type !== 'DAMAGE_DEALT') }
      : attackedState;
    const selfAttackResolved = resolveSelfAttackTrigger(
      checkpointAwakening(state, recordedAttack), attackingPlayerId, attackerInstanceId,
    );
    const listenersResolved = resolveBoardListeners(
      selfAttackResolved, attackingPlayerId, 'OTHER_ALLY_ATTACK', { attackerInstanceId },
    );
    const damageListenersResolved = awakeningPrevented ? listenersResolved : resolveRegisteredRuleListeners(
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
          finishNewAttack(resolved),
        ),
      );
    }
    if (remainingHealth > 0) {
      return actionSuccess(
        processChampionQuestEvents(state, finishNewAttack(damageListenersResolved)),
      );
    }

    return actionSuccess(
      processChampionQuestEvents(state, finishNewAttack({
        ...damageListenersResolved,
        status: 'FINISHED',
        activePlayerId: null,
        winnerId: attackingPlayerId,
        loserId: target.playerId,
      })),
    );
  }

  const piercingAttack = hasAwakeningPassive(attacker, 'DEALER');
  if (piercingAttack) {
    const pierceTarget = findBoardCard(state, target.playerId, target.cardInstanceId)?.card;
    if (!pierceTarget) return actionFailure(state, 'INVALID_ATTACK_TARGET', '해당 대상을 공격할 수 없습니다.');
    state = { ...state, events: [...state.events, { type: 'ATTACK_DECLARED', playerId: attackingPlayerId,
      cardInstanceId: attackerInstanceId, source: { type: 'CARD', cardInstanceId: attackerInstanceId },
      target: { type: 'CARD', cardInstanceId: target.cardInstanceId }, reason: 'BASIC_ATTACK',
      sourceSnapshot: { playerId: attackingPlayerId, cardInstanceId: attackerInstanceId, cardType: attacker.cardType ?? 'WRESTLER', boardSlot: attacker.boardSlot, currentAttack: attacker.currentAttack, currentHealth: attacker.currentHealth },
      targetSnapshot: { playerId: target.playerId, cardInstanceId: pierceTarget.instanceId, cardType: pierceTarget.cardType ?? 'WRESTLER', boardSlot: pierceTarget.boardSlot, currentAttack: pierceTarget.currentAttack, currentHealth: pierceTarget.currentHealth },
    }] };
    state = applyEffect(state, attackingPlayerId, attacker, { type: 'STRUCTURED', action: 'DAMAGE',
      target: { zone: 'BOARD', owner: 'ENEMY', selection: 'SAME_TARGET', count: 1 },
      values: { amount: 1 + attacker.awakening!.awakeningPower } }, [target.cardInstanceId]);
    state = resolveStateBasedDeaths(state);
    if (state.status === 'FINISHED' || !findBoardCard(state, target.playerId, target.cardInstanceId) || !findBoardCard(state, attackingPlayerId, attackerInstanceId)) {
      state = { ...state, players: state.players.map(p => p.id !== attackingPlayerId ? p : { ...p,
        board: p.board.map(c => c?.instanceId === attackerInstanceId ? { ...c, attacksUsedThisTurn: c.attacksUsedThisTurn + 1 } : c) as typeof p.board }) };
      const selfAttack = resolveSelfAttackTrigger(state, attackingPlayerId, attackerInstanceId);
      return actionSuccess(processChampionQuestEvents(actionStartState, finishNewAttack(resolveBoardListeners(selfAttack, attackingPlayerId, 'OTHER_ALLY_ATTACK', { attackerInstanceId }))));
    }
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
  let preDamageState = attackerBeforeDamage !== defenderPrepared && attackerBeforeDamage.targetingState?.active
    ? resolvePendingEffects(attackerBeforeDamage)
    : attackerBeforeDamage;
  const attackerPrepared = findBoardCard(preDamageState, attackingPlayerId, attackerInstanceId)?.card ?? attackerCurrent;
  const defenderPreparedCard = findBoardCard(preDamageState, target.playerId, defender.instanceId)?.card ?? defenderCurrent;
  const preventedAttackerDamage = Boolean(preDamageState.preventedDamageTargetIds?.includes(defender.instanceId)) || (hasEntryDefense(defenderPreparedCard, preDamageState.turn));
  const preventedDefenderDamage = Boolean(preDamageState.preventedDamageTargetIds?.includes(attackerInstanceId)) || (hasEntryDefense(attackerPrepared, preDamageState.turn));
  const attackerDodges =
    !preventedDefenderDamage && attackerPrepared.dodgeAvailable && hasKeyword(attackerPrepared, 'DODGE');
  const defenderDodges =
    !preventedAttackerDamage && defenderPreparedCard.dodgeAvailable && hasKeyword(defenderPreparedCard, 'DODGE');

  let attackerDamage = attackerPrepared.currentAttack +
    getDamageModifierBonus(preDamageState, attackingPlayerId, attackerPrepared) +
    towerCombatAttackBonus(preDamageState, attackingPlayerId, attackerPrepared, defenderPreparedCard);
  let defenderDamage = defenderPreparedCard.currentAttack +
    getDamageModifierBonus(preDamageState, target.playerId, defenderPreparedCard);
  const defendingBoard = preDamageState.players.find(p => p.id === target.playerId)!.board.filter(Boolean);
  const attackingHighest = defendingBoard.every(c => c!.currentAttack <= defenderPreparedCard.currentAttack);
  if (!defenderDodges && !preventedAttackerDamage) {
    const reduced = towerIncomingDamage(preDamageState, target.playerId, defenderPreparedCard, attackerDamage);
    preDamageState = reduced.state; attackerDamage = reduced.amount;
  }
  if (!attackerDodges && !preventedDefenderDamage) {
    const reduced = towerIncomingDamage(preDamageState, attackingPlayerId, attackerPrepared, defenderDamage, attackingHighest);
    preDamageState = reduced.state; defenderDamage = reduced.amount;
  }
  attackerDamage = keywordDamage(defenderPreparedCard, Math.max(0, attackerDamage + (attackerDamage > 0 ? madokawaIncomingBonus(preDamageState, target.playerId, defenderPreparedCard) : 0) - silenceDamageReduction(defenderPreparedCard, attackerPrepared)), preDamageState.turn);
  defenderDamage = keywordDamage(attackerPrepared, Math.max(0, defenderDamage + (defenderDamage > 0 ? madokawaIncomingBonus(preDamageState, attackingPlayerId, attackerPrepared) : 0) - silenceDamageReduction(attackerPrepared, defenderPreparedCard)), preDamageState.turn);
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
  const damagedState: GameState = healLifesteal({
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
  }, attackingPlayerId, attackerPrepared, preventedAttackerDamage || defenderDodges ? 0 : attackerDamage);

  const recordedCombat = piercingAttack ? { ...damagedState, events: damagedState.events.filter((event, index) => index < preDamageState.events.length || event.type !== 'ATTACK_DECLARED') } : damagedState;
  let afterNewDamage = prepareAwakeningCounter(recordedCombat, target.playerId, defenderPreparedCard, combatEventId);
  for (const [ownerId, before] of [[attackingPlayerId,attackerPrepared],[target.playerId,defenderPreparedCard]] as const) {
    const current=findBoardCard(afterNewDamage,ownerId,before.instanceId)?.card;
    if (current && current.currentHealth<before.currentHealth) {
      afterNewDamage=resolveTriggeredAbilities(afterNewDamage,ownerId,current,'SELF_DAMAGED',{healthBefore:before.currentHealth,healthAfter:current.currentHealth});
      if(afterNewDamage.targetingState?.active) afterNewDamage=resolvePendingEffects(afterNewDamage);
    }
  }
  const firstAttackedResolved = resolveTriggeredAbilities(
    afterNewDamage,
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
    resolveAwakeningCounter(damageListenersResolved, target.playerId, defenderPreparedCard, attackerInstanceId, combatEventId),
    damageEventStartIndex,
  );
  return actionSuccess(processChampionQuestEvents(actionStartState, finishNewAttack(resolved)));
}
