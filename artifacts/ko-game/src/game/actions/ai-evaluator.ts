import { isMinionAAbility } from '../champions/minion-a';
import { hasAwakeningInvulnerability } from '../champions/awakening';
import { canUseChampionAbility } from '../engine/champion-system';
import { chooseBestAction as chooseLegacyAction } from './legacy-ai-evaluator';
import type { CardEffect } from '../effects/types';
import type { CardInstance } from '../cards/types';
import type { GameState, PlayerState } from '../types/game-state';
import { getActiveCardAbilities, getActiveCardKeywords } from '../cards/granted-text';
import { executeAction, getLegalActions } from './engine-actions';
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

/** Search uses visible board and own hand only. Hidden identities, deck order and seed are discarded. */
export function aiInformationState(state: GameState, playerId: string): GameState {
  const hidden = (index: number): CardInstance => ({
    instanceId: `unknown:${index}`, definitionId: 'unknown', cardType: 'WRESTLER',
    baseCost: 3, currentCost: 3, baseAttack: 2, currentAttack: 2, baseHealth: 3, currentHealth: 3, maxHealth: 3,
    boardSlot: null, enteredThisTurn: false, attacksUsedThisTurn: 0, isGenerated: false, isToken: false,
    isChampionToken: false, keywords: [], abilities: [], isSilenced: false, isSilenceImmune: false,
    dodgeAvailable: false, dodgeCharges: 0, isStunned: false, activeUsedThisTurn: false, isDirectDeployedChampion: false,
  });
  return { ...state, randomSeed: 0, players: state.players.map((p, i) => ({ ...p,
    hand: p.id === playerId ? p.hand : p.hand.map((_, n) => hidden(i * 1000 + n)),
    deck: p.deck.map((_, n) => hidden(i * 1000 + n + 100)),
  })) };
}

/** Estimate visible next-turn attack exposure, including cheap attacks clearing fragile guards. */
function visibleAttackExposure(own: PlayerState, enemy: PlayerState): number {
  const guards = own.board.filter((card): card is CardInstance => Boolean(card && getActiveCardKeywords(card).includes('TAUNT')))
    .map(card => ({ health: card.currentHealth, attack: card.currentAttack, dodge: card.dodgeAvailable }));
  const attackers = enemy.board.filter((card): card is CardInstance => Boolean(card && !card.isStunned && card.currentAttack > 0))
    .sort((left, right) => left.currentAttack - right.currentAttack);
  let exposure = 0;
  for (const attacker of attackers) {
    let health = attacker.currentHealth;
    const strikes = getActiveCardKeywords(attacker).includes('MULTI_STRIKE') ? 2 : 1;
    for (let strike = 0; strike < strikes && health > 0; strike++) {
      guards.sort((left, right) => left.health - right.health || left.attack - right.attack);
      const guard = guards[0];
      if (!guard) { exposure += attacker.currentAttack; continue; }
      if (guard.dodge) { guard.dodge = false; continue; }
      guard.health -= attacker.currentAttack; health -= guard.attack;
      if (guard.health <= 0) guards.shift();
    }
  }
  return exposure;
}

export function evaluateAction(state: GameState, action: GameAction, playerId: string): number {
  if (isMinionAAbility(state, action)) return canUseChampionAbility(state, playerId) ? 3 : -Infinity;
  const visible = aiInformationState(state, playerId);
  const result = executeAction(visible, action);
  if (!result.success) return -Infinity;
  if (result.state.status === 'FINISHED') return result.state.winnerId === playerId ? 100000 : -100000;
  const before = evaluateState(visible, playerId);
  const after = evaluateState(result.state, playerId);
  const ownBefore = visible.players.find(p => p.id === playerId)!;
  const ownAfter = result.state.players.find(p => p.id === playerId)!;
  const questBonus = ((ownAfter.champion?.questProgress ?? 0) - (ownBefore.champion?.questProgress ?? 0)) * 2 +
    (ownAfter.champion?.questCompleted && !ownBefore.champion?.questCompleted ? 15 : 0);
  const drawBonus = Math.max(0, ownAfter.hand.length - ownBefore.hand.length) * Math.max(0, 5 - ownBefore.hand.length);
  const spent = Math.max(0, ownBefore.currentGold - ownAfter.currentGold);
  const enemyThreat = result.state.players.find(p => p.id !== playerId)!.board.reduce((n, c) => n + (c && !c.isStunned ? c.currentAttack : 0), 0);
  const exposure = hasAwakeningInvulnerability(result.state, playerId) ? 0 : visibleAttackExposure(ownAfter, result.state.players.find(p => p.id !== playerId)!);
  // Visible next-turn lethal outranks optional nonlethal face damage.
  const exposedLethal = exposure >= ownAfter.health && exposure > 0 ? -5000 : 0;
  const survival = exposedLethal + (!hasAwakeningInvulnerability(result.state, playerId) && ownAfter.health <= enemyThreat ? (ownAfter.health - ownBefore.health) * 3 - enemyThreat * 0.5 : 0);
  const awakeningTargetBonus = action.type === 'ATTACK' ? action.target.type === 'PLAYER'
    ? hasAwakeningInvulnerability(visible, action.target.playerId) ? -12 : 0
    : visible.players.find(p => p.id === action.target.playerId)?.champion?.awakening?.activeStageInstanceId === action.target.cardInstanceId ? 6 : 0 : 0;
  return after - before + questBonus + drawBonus - spent * 0.25 + survival + awakeningTargetBonus + (action.type === 'END_TURN' ? -0.5 : 0);
}

export type AIDifficulty = 'NORMAL' | 'HARD' | 'BOSS';
export const AI_SEARCH_PROFILES = {
  NORMAL: { depth: 1, width: 4, budget: 24 },
  HARD: { depth: 2, width: 5, budget: 60 },
  BOSS: { depth: 3, width: 6, budget: 120 },
} as const;
/** Bounded same-turn beam search. Every candidate goes through the shared legal-action engine. */
export function chooseBestAction(state: GameState, actions: GameAction[], playerId: string, difficulty?: AIDifficulty): GameAction {
  // Cancelling a pre-commit choice restores the hand and gold. Evaluating that
  // refund as a gain can make the AI replay/cancel the same card indefinitely.
  // Once it has chosen to play, complete a valid target instead.
  if (state.targetingState?.active && actions.some(action =>
    action.type === 'SELECT_EFFECT_TARGET' || action.type === 'CONFIRM_PRECOMMIT_TARGET')) {
    actions = actions.filter(action => action.type !== 'CANCEL_EFFECT_TARGET');
  }
  if (state.targetingState?.fusion?.stage === 'CHOOSE') return rankActions(state, actions, playerId)[0]?.action ?? { type: 'END_TURN', playerId };
  if (!difficulty) return chooseLegacyAction(state, actions, playerId);
  const visible = aiInformationState(state, playerId);
  const profile = AI_SEARCH_PROFILES[difficulty];
  const root = actions.map((action, index) => ({ action, index, score: evaluateAction(visible, action, playerId) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const fallback = root[0]?.action ?? { type: 'END_TURN' as const, playerId };
  if (root[0]?.score === 100000 || profile.depth === 1) return fallback;
  let best = { action: fallback, score: root[0]?.score ?? -Infinity };
  let beam = root.slice(0, profile.width).flatMap(candidate => {
    if (isMinionAAbility(visible, candidate.action)) return [];
    const result = executeAction(visible, candidate.action);
    return result.success ? [{ first: candidate.action, state: result.state, score: candidate.score }] : [];
  });
  let budget = profile.budget;
  for (let depth = 1; depth < profile.depth && beam.length && budget > 0; depth++) {
    const expanded: typeof beam = [];
    for (const node of beam) {
      if (node.state.status !== 'IN_PROGRESS' || node.state.activePlayerId !== playerId || node.first.type === 'END_TURN') continue;
      const candidates = getLegalActions(node.state, playerId).filter(a => a.type !== 'END_TURN' && a.type !== 'EMOTE' && a.type !== 'CANCEL_EFFECT_TARGET')
        .slice(0, 80).map(action => ({ action, score: evaluateAction(node.state, action, playerId) })).sort((a, b) => b.score - a.score).slice(0, profile.width);
      for (const candidate of candidates) {
        if (--budget < 0) break;
        if (isMinionAAbility(node.state, candidate.action)) {
          const score = node.score + candidate.score * Math.pow(0.9, depth);
          if (score > best.score) best = { action: node.first, score };
          continue;
        }
        const result = executeAction(node.state, candidate.action);
        if (!result.success) continue;
        if (result.state.status === 'FINISHED' && result.state.winnerId === playerId) return node.first;
        const score = node.score + candidate.score * Math.pow(0.9, depth);
        if (score > best.score) best = { action: node.first, score };
        expanded.push({ first: node.first, state: result.state, score });
      }
    }
    beam = expanded.sort((a, b) => b.score - a.score).slice(0, profile.width);
  }
  return best.action;
}

export function rankActions(state: GameState, actions: GameAction[], playerId: string) {
  return actions
    .map((action, index) => ({ action, score: evaluateAction(state, action, playerId), index }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
}
