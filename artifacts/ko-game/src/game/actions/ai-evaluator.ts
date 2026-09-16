import type { CardEffect } from '../effects/types';
import type { CardInstance } from '../cards/types';
import type { GameState } from '../types/game-state';
import { executeAction } from './engine-actions';
import type { GameAction } from './types';

const EFFECT_VALUES: Record<string, number> = {
  DAMAGE: 4,
  DAMAGE_OPPONENT_CHAMPION: 5,
  HEAL: 3,
  BUFF: 3,
  TEMP_BUFF: 2,
  SET_STATS: 4,
  MULTIPLY_STATS: 6,
  DRAW: 3,
  SUMMON: 4,
  GENERATE: 2,
  DESTROY: 6,
  RETIRE: 4,
  REMOVE_FROM_GAME: 5,
  SILENCE: 4,
  STUN: 4,
  GAIN_GOLD: 3,
  COST_REDUCTION: 2,
};

function effectValue(effect: CardEffect): number {
  if (effect.type === 'GAIN_GOLD') return effect.amount * EFFECT_VALUES.GAIN_GOLD;
  if (effect.type === 'DAMAGE_OPPONENT_CHAMPION') return effect.amount * EFFECT_VALUES.DAMAGE_OPPONENT_CHAMPION;
  if (effect.type === 'MODIFY_SELF_ATTACK') return effect.amount * EFFECT_VALUES.BUFF;
  if (effect.type !== 'STRUCTURED') return 0;

  const actionValue = EFFECT_VALUES[effect.action] ?? 0;
  const amount = effect.values?.amount ?? effect.values?.attack ?? effect.values?.health ?? 1;
  const nested = [
    ...(effect.values?.leftEffects ?? []),
    ...(effect.values?.rightEffects ?? []),
  ].reduce((total, child) => total + effectValue(child), 0);
  return actionValue * Math.max(1, amount) + nested;
}

export function estimateCardValue(card: CardInstance): number {
  const bodyValue = card.abilities.reduce(
    (total, ability) => total + ability.effects.reduce((sum, effect) => sum + effectValue(effect), 0),
    0,
  );
  const keywordValue = card.keywords.length * 1.5;
  return card.currentAttack * 1.2 + card.currentHealth * 0.8 + bodyValue + keywordValue - card.currentCost * 0.7;
}

function visiblePlayerValue(state: GameState, playerId: string): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return -Infinity;
  const boardValue = player.board.reduce(
    (total, card) => total + (card ? card.currentAttack * 1.5 + card.currentHealth : 0),
    0,
  );
  const championValue = player.champion ? player.champion.health * 1.2 : 0;
  return player.health * 3 + boardValue + championValue + player.currentGold * 0.8 + player.hand.length * 0.5;
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