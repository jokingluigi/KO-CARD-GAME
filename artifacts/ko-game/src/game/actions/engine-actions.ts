import type { AttackTarget } from '../engine/combat';
import { attack } from '../engine/combat';
import { canUseActiveAbility, useActiveAbility } from '../engine/card-status';
import { canUseChampionAbility, useChampionAbility } from '../engine/champion-system';
import { playTechniqueFromHand } from '../engine/play-technique';
import { playWrestlerFromHand } from '../engine/play-wrestler';
import { endTurn } from '../engine/turn-system';
import { processChampionQuestEvents } from '../champions/quests';
import { selectEffectTarget } from '../effects/effect-engine';
import type { BoardSlot } from '../engine/board-position';
import type { GameState } from '../types/game-state';
import {
  actionFailure,
  actionSuccess,
  type ActionResult,
  type GameAction,
} from './types';

const BOARD_SLOTS: BoardSlot[] = [0, 1, 2, 3];

function probe(state: GameState, action: GameAction): boolean {
  return executeAction(state, action).success;
}

export function getLegalActions(state: GameState, playerId: string): GameAction[] {
  if (state.status !== 'IN_PROGRESS' || state.activePlayerId !== playerId) return [];

  if (state.targetingState?.active) {
    if (state.targetingState.playerId !== playerId) return [];
    return state.targetingState.validTargetIds.map((targetId) => ({
      type: 'SELECT_EFFECT_TARGET' as const,
      playerId,
      targetId,
    }));
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
    } else {
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
  return actions;
}

export function executeAction(state: GameState, action: GameAction): ActionResult {
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
    case 'SELECT_EFFECT_TARGET': {
      const pending = state.targetingState;
      if (!pending?.active || pending.playerId !== action.playerId) {
        return actionFailure(state, 'NO_VALID_TARGET', '선택할 수 있는 대상이 없습니다.');
      }
      const selected = processChampionQuestEvents(state, selectEffectTarget(state, action.targetId));
      return selected === state
        ? actionFailure(state, 'NO_VALID_TARGET', '선택할 수 없는 대상입니다.')
        : actionSuccess(selected);
    }
  }
}