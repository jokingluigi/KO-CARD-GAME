import type { AttackTarget } from '../engine/combat';
import { attack } from '../engine/combat';
import { canUseActiveAbility, useActiveAbility } from '../engine/card-status';
import { canUseChampionAbility, useChampionAbility } from '../engine/champion-system';
import { playTechniqueFromHand } from '../engine/play-technique';
import { playWrestlerFromHand } from '../engine/play-wrestler';
import { endTurn } from '../engine/turn-system';
import { processChampionQuestEvents } from '../champions/quests';
import { cancelEffectTargeting, selectEffectTarget } from '../effects/effect-engine';
import { surrender } from '../engine/surrender';
import type { BoardSlot } from '../engine/board-position';
import type { GameState } from '../types/game-state';
import {
  actionFailure,
  actionSuccess,
  type ActionResult,
  type GameAction,
} from './types';

const BOARD_SLOTS: BoardSlot[] = [0, 1, 2, 3];
const legalActionsCache = new WeakMap<GameState, Map<string, GameAction[]>>();

type TargetedAction = Extract<GameAction, { type: 'BEGIN_TARGETED_ACTION' }>['action'];

function immediateAction(state: GameState, playerId: string, action: TargetedAction): ActionResult {
  if (action.type === 'PLAY_TECHNIQUE') return playTechniqueFromHand(state, playerId, action.cardInstanceId);
  if (action.type === 'USE_ACTIVE') return useActiveAbility(state, playerId, action.cardInstanceId);
  return useChampionAbility(state, playerId);
}

function beginTargetedAction(state: GameState, action: Extract<GameAction, { type: 'BEGIN_TARGETED_ACTION' }>): ActionResult {
  const probeState = structuredClone(state);
  const probe = immediateAction(probeState, action.playerId, action.action);
  if (!probe.success) return actionFailure(state, probe.errorCode, probe.message);
  const pending = probe.state.targetingState;
  if (!pending?.active) return probe;
  if (pending.validTargetIds.length === 0) {
    return actionFailure(state, 'NO_VALID_TARGET', '선택 가능한 대상이 없습니다.');
  }
  return actionSuccess({
    ...state,
    targetingState: {
      ...pending,
      phase: 'PRE_COMMIT',
      pendingAction: action.action,
    },
  });
}

function probe(state: GameState, action: GameAction): boolean {
  return executeAction(state, action).success;
}

export function getLegalActions(state: GameState, playerId: string): GameAction[] {
  const cachedByPlayer = legalActionsCache.get(state);
  const cached = cachedByPlayer?.get(playerId);
  if (cached) return cached;
  if (state.status !== 'IN_PROGRESS' || state.activePlayerId !== playerId) return [];

  if (state.targetingState?.active) {
    if (state.targetingState.playerId !== playerId) return [];
    const actions: GameAction[] = state.targetingState.validTargetIds.map((targetId) =>
      state.targetingState?.phase === 'PRE_COMMIT'
        ? { type: 'CONFIRM_PRECOMMIT_TARGET' as const, playerId, targetId }
        : { type: 'SELECT_EFFECT_TARGET' as const, playerId, targetId },
    );
    actions.push({ type: 'CANCEL_EFFECT_TARGET', playerId });
    if (cachedByPlayer) cachedByPlayer.set(playerId, actions);
    else legalActionsCache.set(state, new Map([[playerId, actions]]));
    return actions;
  }

  const player = state.players.find((candidate) => candidate.id === playerId);
  const opponent = state.players.find((candidate) => candidate.id !== playerId);
  if (!player || !opponent) return [];

  const actions: GameAction[] = [];
  player.hand.forEach((card) => {
    if (card.cardType === 'WRESTLER') {
      BOARD_SLOTS.forEach((boardSlot) => {
        const action: GameAction = { type: 'PLAY_WRESTLER', playerId, cardInstanceId: card.instanceId, boardSlot };
        if (probe(state, action)) actions.push(action);
      });
    } else if (card.cardType === 'TECHNIQUE') {
      const action: GameAction = { type: 'PLAY_TECHNIQUE', playerId, cardInstanceId: card.instanceId };
      if (probe(state, action)) actions.push(action);
    }
  });

  player.board.forEach((card) => {
    if (!card || !canUseActiveAbility(state, playerId, card.instanceId)) return;
    const action: GameAction = { type: 'USE_ACTIVE', playerId, cardInstanceId: card.instanceId };
    if (probe(state, action)) actions.push(action);
  });

  if (canUseChampionAbility(state, playerId)) {
    const action: GameAction = { type: 'USE_CHAMPION_ABILITY', playerId };
    if (probe(state, action)) actions.push(action);
  }

  player.board.forEach((card) => {
    if (!card) return;
    const targets: AttackTarget[] = [
      ...opponent.board
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
        .map((target) => ({ type: 'WRESTLER' as const, playerId: opponent.id, cardInstanceId: target.instanceId })),
      { type: 'PLAYER', playerId: opponent.id },
    ];
    targets.forEach((target) => {
      const action: GameAction = {
        type: 'ATTACK',
        playerId,
        attackerInstanceId: card.instanceId,
        target,
      };
      if (probe(state, action)) actions.push(action);
    });
  });

  actions.push({ type: 'END_TURN', playerId });
  if (cachedByPlayer) cachedByPlayer.set(playerId, actions);
  else legalActionsCache.set(state, new Map([[playerId, actions]]));
  return actions;
}

export function executeAction(state: GameState, action: GameAction): ActionResult {
  if (action.type === 'BEGIN_TARGETED_ACTION') return beginTargetedAction(state, action);
  switch (action.type) {
    case 'PLAY_WRESTLER':
      return playWrestlerFromHand(state, action.playerId, action.cardInstanceId, action.boardSlot);
    case 'PLAY_TECHNIQUE':
      return playTechniqueFromHand(state, action.playerId, action.cardInstanceId);
    case 'USE_ACTIVE':
      return useActiveAbility(state, action.playerId, action.cardInstanceId);
    case 'USE_CHAMPION_ABILITY':
      return useChampionAbility(state, action.playerId);
    case 'ATTACK':
      return attack(state, action.playerId, action.attackerInstanceId, action.target);
    case 'END_TURN':
      return endTurn(state, action.playerId);
    case 'SURRENDER':
      return surrender(state, action.playerId);
    case 'SELECT_EFFECT_TARGET': {
      const pending = state.targetingState;
      if (!pending?.active || pending.playerId !== action.playerId) {
        return actionFailure(state, 'NO_VALID_TARGET', '선택할 수 있는 대상이 없습니다.');
      }
      if (pending.phase === 'PRE_COMMIT') {
        return actionFailure(state, 'TARGET_SELECTION_PENDING', '사용을 확정한 뒤 대상을 선택하세요.');
      }
      const selected = selectEffectTarget(state, action.targetId);
      return selected === state
        ? actionFailure(state, 'NO_VALID_TARGET', '선택할 수 없는 대상입니다.')
        : actionSuccess(processChampionQuestEvents(state, selected));
    }
    case 'CANCEL_EFFECT_TARGET': {
      const pending = state.targetingState;
      if (!pending?.active || pending.playerId !== action.playerId) {
        return actionFailure(state, 'NO_VALID_TARGET', '취소할 선택이 없습니다.');
      }
      return actionSuccess(cancelEffectTargeting(state));
    }
    case 'CONFIRM_PRECOMMIT_TARGET': {
      const pending = state.targetingState;
      if (!pending?.active || pending.phase !== 'PRE_COMMIT' || pending.playerId !== action.playerId ||
        !pending.pendingAction || !pending.validTargetIds.includes(action.targetId)) {
        return actionFailure(state, 'NO_VALID_TARGET', '선택할 수 없는 대상입니다.');
      }
      const actionToRun = pending.pendingAction as TargetedAction;
      const committed = immediateAction({ ...state, targetingState: undefined }, action.playerId, actionToRun);
      if (!committed.success) return actionFailure(state, committed.errorCode, committed.message);
      const committedPending = committed.state.targetingState;
      if (!committedPending?.active || !committedPending.validTargetIds.includes(action.targetId)) {
        return actionFailure(state, 'NO_VALID_TARGET', '선택할 수 없는 대상입니다.');
      }
      const selectedState = selectEffectTarget(committed.state, action.targetId);
      if (selectedState === committed.state) {
        return actionFailure(state, 'NO_VALID_TARGET', '선택할 수 없는 대상입니다.');
      }
      const selected = processChampionQuestEvents(committed.state, selectedState);
      return actionSuccess(selected);
    }
  }
}