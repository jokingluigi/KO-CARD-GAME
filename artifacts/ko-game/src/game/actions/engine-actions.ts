import { deferFinisherChoiceResolution, selectPreparedFinisher } from '../champions/finisher-preparation';
import {normalizePandoraTargeting} from '../champions/pandora-targeting';
import { hasPendingProgram, hasPendingFinisherCast } from '../engine/program';
import {resolveConfiguredTowerEffects} from '../tower/configured-effects';
import { hasCommittedFusion } from '../engine/fusion';
import { isMinionAAbility } from '../champions/minion-a';
import type { AttackTarget } from '../engine/combat';
import { attack,resumePendingComboAttack } from '../engine/combat';
import { canUseActiveAbility, useActiveAbility } from '../engine/card-status';
import { canUseChampionAbility, useChampionAbility } from '../engine/champion-system';
import { playTechniqueFromHand } from '../engine/play-technique';
import { playWrestlerFromHand } from '../engine/play-wrestler';
import { endTurn, resumeDeferredTurnStart, resumeDeferredOpening } from '../engine/turn-system';
import { canMulligan, mulligan } from '../engine/mulligan';
import { processChampionQuestEvents } from '../champions/quests';
import { cancelEffectTargeting, selectEffectTarget } from '../effects/effect-engine';
import { surrender } from '../engine/surrender';
import { CHAMPION_EMOTES } from '../champions/types';
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
  if (!pending?.active || pending.handAddition || pending.catalogChoice || (pending.minTargets>0 && pending.maxTargets>pending.minTargets) || hasPendingProgram(probe.state)) return probe;
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
  state = normalizePandoraTargeting(state);
  const cachedByPlayer = legalActionsCache.get(state);
  const cached = cachedByPlayer?.get(playerId);
  if (cached) return cached;
  if (state.status !== 'IN_PROGRESS') return [];
  if (state.targetingState?.active) {
    if (state.targetingState.playerId !== playerId) return [];
    const actions: GameAction[] = state.targetingState.validTargetIds.map((targetId) =>
      state.targetingState?.phase === 'PRE_COMMIT'
        ? { type: 'CONFIRM_PRECOMMIT_TARGET' as const, playerId, targetId }
        : { type: 'SELECT_EFFECT_TARGET' as const, playerId, targetId },
    );
    if((state.targetingState.minTargets>0 && state.targetingState.maxTargets>state.targetingState.minTargets)&&state.targetingState.selectedTargetIds.length>=state.targetingState.minTargets)actions.push({type:'SELECT_EFFECT_TARGET',playerId,targetId:'effect:confirm'});
    if (!state.targetingState.catalogChoice && !((state.targetingState.minTargets>0 && state.targetingState.maxTargets>state.targetingState.minTargets)) && !hasPendingProgram(state) && (!hasPendingFinisherCast(state) || state.targetingState.cancelable) && !state.targetingState.finisherChoice && !state.targetingState.handAddition && !state.targetingState.championRewardReplacement && (!hasCommittedFusion(state.targetingState) || state.targetingState.cancelable)) actions.push({ type: 'CANCEL_EFFECT_TARGET', playerId });
    if (cachedByPlayer) cachedByPlayer.set(playerId, actions);
    else legalActionsCache.set(state, new Map([[playerId, actions]]));
    return actions;
  }

  if (state.openingMulligan) return canMulligan(state, playerId)
    ? [{ type: 'MULLIGAN', playerId, cardInstanceIds: [] }] : [];

  if (state.activePlayerId !== playerId) return [];
  const player = state.players.find((candidate) => candidate.id === playerId);
  const opponent = state.players.find((candidate) => candidate.id !== playerId);
  if (!player || !opponent) return [];

  const actions: GameAction[] = [];
  if (canMulligan(state, playerId)) actions.push({ type: 'MULLIGAN', playerId, cardInstanceIds: [] });
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
    if (isMinionAAbility(state, action) || probe(state, action)) actions.push(action);
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

function executeActionInternal(state: GameState, action: GameAction): ActionResult {
  if(state.status==='FINISHED')return actionFailure(state,'GAME_NOT_IN_PROGRESS','종료된 대전에서는 행동할 수 없습니다.');
  if (state.openingMulligan && !(state.targetingState?.active && action.type==='SELECT_EFFECT_TARGET') && action.type !== 'MULLIGAN' && action.type !== 'EMOTE' && action.type !== 'SURRENDER')
    return actionFailure(state, 'NOT_YOUR_TURN', '두 플레이어가 시작 손패 교체를 마칠 때까지 기다려 주세요.');
  if(state.targetingState?.catalogChoice&&!['SELECT_EFFECT_TARGET','SURRENDER','EMOTE'].includes(action.type))return actionFailure(state,'TARGET_SELECTION_PENDING','가져올 카드 한 장을 선택하세요.');
  if (state.targetingState?.handAddition && !['SELECT_EFFECT_TARGET','SURRENDER','EMOTE'].includes(action.type)) return actionFailure(state,'TARGET_SELECTION_PENDING','손패에서 버릴 카드 1장을 선택하세요.');
  if (hasPendingProgram(state) && !['SELECT_EFFECT_TARGET','SURRENDER','EMOTE'].includes(action.type)) return actionFailure(state,'TARGET_SELECTION_PENDING','업그레이드 효과의 대상을 선택하세요.');
  if (state.targetingState?.finisherChoice && !['SELECT_EFFECT_TARGET','SURRENDER','EMOTE'].includes(action.type)) return actionFailure(state,'TARGET_SELECTION_PENDING','사용할 피니셔를 하나 선택하세요.');
  if (hasPendingFinisherCast(state) && !['SELECT_EFFECT_TARGET','SURRENDER','EMOTE'].includes(action.type) && !(action.type==='CANCEL_EFFECT_TARGET' && state.targetingState?.cancelable)) return actionFailure(state,'TARGET_SELECTION_PENDING','피니셔 효과의 대상을 선택하세요.');
  if(action.type==='COMMIT_TARGETED_ACTION'){
    if(state.targetingState?.active)return actionFailure(state,'TARGET_SELECTION_PENDING','현재 대상 선택을 먼저 완료하세요.');
    const preview=beginTargetedAction(state,{type:'BEGIN_TARGETED_ACTION',playerId:action.playerId,action:action.action});
    if(!preview.success)return preview;
    const pending=preview.state.targetingState;
    if(pending?.phase!=='PRE_COMMIT'||pending.minTargets!==1||pending.maxTargets!==1||!pending.validTargetIds.includes(action.targetId))return actionFailure(state,'NO_VALID_TARGET','이 대상은 사용할 수 없습니다.');
    return executeActionInternal(preview.state,{type:'CONFIRM_PRECOMMIT_TARGET',playerId:action.playerId,targetId:action.targetId});
  }
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
    case 'MULLIGAN':
      return mulligan(state, action.playerId, action.cardInstanceIds);
    case 'END_TURN':
      return endTurn(state, action.playerId);
    case 'EMOTE': {
      if (state.status !== 'IN_PROGRESS') return actionFailure(state, 'GAME_NOT_IN_PROGRESS', '진행 중인 경기에서만 감정표현을 할 수 있습니다.');
      const player = state.players.find((candidate) => candidate.id === action.playerId);
      if (!player?.champion || !CHAMPION_EMOTES.includes(action.emote)) {
        return actionFailure(state, 'INVALID_PLAYER', '사용할 수 없는 감정표현입니다.');
      }
      return actionSuccess({ ...state, events: [...state.events, {
        type: 'CHAMPION_EMOTE', playerId: player.id, championId: player.champion.id,
        source: { type: 'CHAMPION', championId: player.champion.id },
        target: { type: 'CHAMPION', championId: player.champion.id },
        reason: action.emote, tags: player.champion.questCompleted ? ['AFTER_QUEST'] : [],
      }] });
    }
    case 'SURRENDER':
      return surrender(state, action.playerId);
    case 'SELECT_EFFECT_TARGET': {
      const pending = state.targetingState;
      if (!pending?.active || pending.playerId !== action.playerId) {
        return actionFailure(state, 'NO_VALID_TARGET', '선택할 수 있는 대상이 없습니다.');
      }
      if (pending.finisherChoice) {
        const selected = selectPreparedFinisher(state, action.playerId, action.targetId);
        return selected === state ? actionFailure(state,'NO_VALID_TARGET','선택할 수 없는 피니셔입니다.') : actionSuccess(selected);
      }
      if (pending.phase === 'PRE_COMMIT') {
        return actionFailure(state, 'TARGET_SELECTION_PENDING', '사용을 확정한 뒤 대상을 선택하세요.');
      }
      let selected = selectEffectTarget(state, action.targetId);
      if (selected !== state && selected.targetingState?.active && !hasPendingProgram(state) && pending.playRollback && pending.fusion?.stage !== "CHOOSE") selected = { ...selected, targetingState: { ...selected.targetingState, playRollback: pending.playRollback } };
      return selected === state
        ? actionFailure(state, 'NO_VALID_TARGET', '선택할 수 없는 대상입니다.')
        : actionSuccess(processChampionQuestEvents(state, selected));
    }
    case 'CANCEL_EFFECT_TARGET': {
      const pending = state.targetingState;
      if (!pending?.active || pending.playerId !== action.playerId) {
        return actionFailure(state, 'NO_VALID_TARGET', '취소할 선택이 없습니다.');
      }
      if (pending.finisherChoice) return actionFailure(state,'TARGET_SELECTION_PENDING','피니셔 선택을 완료하세요.');
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

export function executeAction(state: GameState, action: GameAction): ActionResult {
  state = normalizePandoraTargeting(state);
  const result = deferFinisherChoiceResolution(()=>{
    const initial = executeActionInternal(state, action);
    const result = initial.success && initial.state.pendingComboAttack && !initial.state.targetingState?.active
      ? resumePendingComboAttack(initial.state) : initial;
    return result.success ? {...result,state:resolveConfiguredTowerEffects(state,resumeDeferredTurnStart(resumeDeferredOpening(result.state)))} : result;
  });
  if (!result.success || !(state.pendingFinisherCasts?.length || result.state.pendingFinisherCasts?.length || state.players.some(p=>p.champion?.quest?.finisher || p.champion?.quest?.finisherChoices?.length)) || (action.type==='CANCEL_EFFECT_TARGET' && !hasPendingFinisherCast(state)) ||
      (result.state.targetingState?.phase==='PRE_COMMIT' && result.state.events.length===state.events.length)) return result;
  let final = result.state;
  for (let pass=0;pass<state.players.length+1;pass++) {
    const before=final.events.length;
    final=processChampionQuestEvents(state,final);
    if(final.events.length===before)break;
  }
  return {...result,state:final};
}
