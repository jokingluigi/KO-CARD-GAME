import type { CardEffect } from '../effects/types';
import type { CardInstance } from '../cards/types';
import type { GameState, PlayerState } from '../types/game-state';
import { getActiveCardAbilities, getActiveCardKeywords } from '../cards/granted-text';
import { executeAction } from './engine-actions';
import type { GameAction } from './types';

const KEYWORD_VALUES: Record<string, number> = {
  TAUNT: 4,
  DODGE: 4,
  RUSH: 2,
  SURPRISE: 2,
  MULTI_STRIKE: 4,
};

type EffectEvaluator = (effect: Extract<CardEffect, { type: 'STRUCTURED' }>) => number;

const EFFECT_EVALUATORS: Record<string, EffectEvaluator> = {
  DAMAGE: (effect) => (effect.values?.amount ?? 1) * 4,
  DAMAGE_OPPONENT_CHAMPION: (effect) => (effect.values?.amount ?? 1) * 5,
  HEAL: (effect) => (effect.values?.amount ?? 1) * 2.5,
  BUFF: (effect) => Math.abs(effect.values?.attack ?? 0) * 2 + Math.abs(effect.values?.health ?? 0) * 1.5,
  TEMP_BUFF: (effect) => Math.abs(effect.values?.attack ?? 0) * 1.5 + Math.abs(effect.values?.health ?? 0),
  SET_STATS: (effect) => Math.abs(effect.values?.attack ?? 0) * 2 + Math.abs(effect.values?.health ?? 0) * 1.5,
  MULTIPLY_STATS: (effect) => Math.max(1, Math.abs(effect.values?.attackMultiplier ?? 1) + Math.abs(effect.values?.healthMultiplier ?? 1)) * 2,
  DESTROY: () => 11,
  RETIRE: () => 7,
  REMOVE_FROM_GAME: () => 9,
  SILENCE: () => 7,
  STUN: () => 6,
  DRAW: (effect) => Math.max(1, effect.values?.amount ?? 1) * 3,
  GENERATE: () => 2.5,
  SUMMON: () => 6,
  GAIN_GOLD: (effect) => (effect.values?.amount ?? 1) * 3,
  COST_REDUCTION: (effect) => Math.max(1, effect.values?.amount ?? 1) * 2,
};

function effectValue(effect: CardEffect): number {
  if (effect.type === 'GAIN_GOLD') return effect.amount * 3;
  if (effect.type === 'DAMAGE_OPPONENT_CHAMPION') return effect.amount * 5;
  if (effect.type === 'MODIFY_SELF_ATTACK') return effect.amount * 2;
  if (effect.type !== 'STRUCTURED') return 1;

  const evaluator = EFFECT_EVALUATORS[effect.action];
  const base = evaluator ? evaluator(effect) : Math.max(
    1,
    Math.abs(effect.values?.amount ?? 0) +
      Math.abs(effect.values?.attack ?? 0) +
      Math.abs(effect.values?.health ?? 0),
  );
  const nested = [
    ...(effect.values?.leftEffects ?? []),
    ...(effect.values?.rightEffects ?? []),
  ].reduce((total, child) => total + effectValue(child), 0);
  return base + nested;
}

function keywordValue(card: CardInstance): number {
  return getActiveCardKeywords(card).reduce((total, keyword) => total + (KEYWORD_VALUES[keyword] ?? 1.5), 0);
}

function abilityValue(card: CardInstance): number {
  if (card.isSilenced || card.isAbilityDisabled) return 0;
  return getActiveCardAbilities(card).reduce(
    (total, ability) => total + ability.effects.reduce((sum, effect) => sum + effectValue(effect), 0),
    0,
  );
}

export function estimateCardValue(card: CardInstance): number {
  const statusValue = card.isStunned ? -Math.min(card.currentAttack * 0.8, 4) : 0;
  const survivalValue = Math.max(0, card.currentHealth) * 1.1;
  return card.currentAttack * 1.4 + survivalValue + abilityValue(card) + keywordValue(card) + statusValue - card.currentCost * 0.7;
}

function boardValue(player: PlayerState): number {
  return player.board.reduce((total, card) => {
    if (!card) return total;
    const championProtection = getActiveCardKeywords(card).includes('TAUNT') && player.champion ? 3 : 0;
    return total + estimateCardValue(card) + championProtection;
  }, 0);
}

function visiblePlayerValue(state: GameState, playerId: string): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return -Infinity;
  const championValue = player.champion
    ? player.champion.health * 1.4 + (player.champion.maxHealth - player.champion.health) * 0.3
    : 0;
  return player.health * 3.5 +
    boardValue(player) +
    championValue +
    player.currentGold * 1.1 +
    Math.min(player.hand.length, 7) * 0.7 -
    Math.max(0, player.hand.length - 7) * 1.5;
}

export function evaluateState(state: GameState, playerId: string): number {
  const opponentId = state.players.find((candidate) => candidate.id !== playerId)?.id;
  if (!opponentId) return -Infinity;
  if (state.status === 'FINISHED') {
    if (state.winnerId === playerId) return 100000;
    if (state.loserId === playerId) return -100000;
  }
  return visiblePlayerValue(state, playerId) - visiblePlayerValue(state, opponentId);
}

function targetValue(state: GameState, targetId: string, playerId: string): number {
  for (const player of state.players) {
    const card = player.board.find((candidate) => candidate?.instanceId === targetId);
    if (card) {
      const value = estimateCardValue(card);
      return player.id === playerId ? value : -value;
    }
  }
  return 0;
}

export function evaluateAction(state: GameState, action: GameAction, playerId: string): number {
  const result = executeAction(state, action);
  if (!result.success) return -Infinity;
  const before = evaluateState(state, playerId);
  const after = evaluateState(result.state, playerId);
  let bonus = 0;

  if (action.type === 'PLAY_WRESTLER' || action.type === 'PLAY_TECHNIQUE') {
    const card = state.players.find((player) => player.id === playerId)?.hand
      .find((candidate) => candidate.instanceId === action.cardInstanceId);
    bonus += card ? estimateCardValue(card) : 0;
  } else if (action.type === 'ATTACK') {
    bonus += action.target.type === 'PLAYER' ? 8 : 3;
    if (action.target.type === 'WRESTLER') bonus += Math.max(0, targetValue(state, action.target.cardInstanceId, playerId));
    const opponent = result.state.players.find((player) => player.id !== playerId);
    if ((opponent && opponent.health <= 0) || opponent?.champion?.health === 0) bonus += 100;
  } else if (action.type === 'SELECT_EFFECT_TARGET') {
    bonus += Math.max(0, targetValue(state, action.targetId, playerId));
  } else if (action.type === 'END_TURN') {
    bonus -= 2;
  }
  return after - before + bonus;
}

export function chooseBestAction(state: GameState, actions: GameAction[], playerId: string): GameAction {
  return actions
    .map((action, index) => ({
      action,
      score: evaluateAction(state, action, playerId),
      index,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.action
    ?? { type: 'END_TURN', playerId };
}

export function rankActions(state: GameState, actions: GameAction[], playerId: string) {
  return actions
    .map((action, index) => ({ action, score: evaluateAction(state, action, playerId), index }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
}