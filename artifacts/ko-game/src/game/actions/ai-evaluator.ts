import { isMinionAAbility } from "../champions/minion-a";
import { hasAwakeningInvulnerability } from "../champions/awakening";
import { canUseChampionAbility } from "../engine/champion-system";
import { isChampionProtectedByToken } from "../engine/direct-champion";
import type { CardEffect } from "../effects/types";
import type { CardInstance } from "../cards/types";
import type { GameState, PlayerState } from "../types/game-state";
import {
  getActiveCardAbilities,
  getActiveCardKeywords,
} from "../cards/granted-text";
import { executeAction, getLegalActions } from "./engine-actions";
import type { GameAction } from "./types";

const KEYWORD_VALUES: Record<string, number> = {
  // Its value is already reflected by actual paid effects in the simulation.
  PROGRAM: 0,
  TAUNT: 4,
  DODGE: 4,
  RUSH: 2,
  SURPRISE: 2,
  ARMOR: 3,
  REGEN: 3,
  IMMUNE: 5,
  LIFESTEAL: 3,
  MULTI_STRIKE: 4,
};

type EffectEvaluator = (
  effect: Extract<CardEffect, { type: "STRUCTURED" }>,
) => number;

const EFFECT_EVALUATORS: Record<string, EffectEvaluator> = {
  DAMAGE: (effect) => (effect.values?.amount ?? 1) * 4,
  DAMAGE_OPPONENT_CHAMPION: (effect) => (effect.values?.amount ?? 1) * 5,
  HEAL: (effect) => (effect.values?.amount ?? 1) * 2.5,
  BUFF: (effect) =>
    Math.abs(effect.values?.attack ?? 0) * 2 +
    Math.abs(effect.values?.health ?? 0) * 1.5,
  TEMP_BUFF: (effect) =>
    Math.abs(effect.values?.attack ?? 0) * 1.5 +
    Math.abs(effect.values?.health ?? 0),
  SET_STATS: (effect) =>
    Math.abs(effect.values?.attack ?? 0) * 2 +
    Math.abs(effect.values?.health ?? 0) * 1.5,
  MULTIPLY_STATS: (effect) =>
    Math.max(
      1,
      Math.abs(effect.values?.attackMultiplier ?? 1) +
        Math.abs(effect.values?.healthMultiplier ?? 1),
    ) * 2,
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
  if (effect.type === "GAIN_GOLD") return effect.amount * 3;
  if (effect.type === "DAMAGE_OPPONENT_CHAMPION") return effect.amount * 5;
  if (effect.type === "MODIFY_SELF_ATTACK") return effect.amount * 2;
  if (effect.type !== "STRUCTURED") return 1;

  const evaluator = EFFECT_EVALUATORS[effect.action];
  const base = evaluator
    ? evaluator(effect)
    : Math.max(
        1,
        Math.abs(effect.values?.amount ?? 0) +
          Math.abs(effect.values?.attack ?? 0) +
          Math.abs(effect.values?.health ?? 0),
      );
  const listener = effect.values?.listener;
  const listenerValue = listener
    ? effectValue({ type: "STRUCTURED", ...listener.effect }) * 2
    : 0;
  const nested = [
    ...(effect.values?.leftEffects ?? []),
    ...(effect.values?.rightEffects ?? []),
  ].reduce((total, child) => total + effectValue(child), 0);
  return base + nested + listenerValue;
}

function keywordValue(card: CardInstance): number {
  return getActiveCardKeywords(card).reduce(
    (total, keyword) => total + (KEYWORD_VALUES[keyword] ?? 1.5),
    0,
  );
}

function abilityValue(card: CardInstance): number {
  if (card.isSilenced || card.isAbilityDisabled) return 0;
  return getActiveCardAbilities(card).reduce((total, ability) => {
    const entry =
      ability.trigger === "ENTER_FIELD" || ability.trigger === "SELF_ENTERED";
    const effects = entry
      ? ability.effects.filter(
          (effect) =>
            effect.type === "STRUCTURED" &&
            effect.action === "REGISTER_LISTENER",
        )
      : ability.effects;
    if (ability.trigger === "ACTIVE" && card.activeUsed) return total;
    return (
      total + effects.reduce((sum, effect) => sum + effectValue(effect), 0)
    );
  }, 0);
}

export function estimateCardValue(card: CardInstance): number {
  const statusValue = card.isStunned
    ? -Math.min(card.currentAttack * 0.8, 4)
    : 0;
  const survivalValue = Math.max(0, card.currentHealth) * 1.1;
  return (
    card.currentAttack * 1.4 +
    survivalValue +
    abilityValue(card) +
    keywordValue(card) +
    statusValue -
    card.currentCost * 0.7
  );
}

function boardValue(player: PlayerState): number {
  return player.board.reduce((total, card) => {
    if (!card) return total;
    const championProtection =
      getActiveCardKeywords(card).includes("TAUNT") && player.champion ? 3 : 0;
    return total + estimateCardValue(card) + championProtection;
  }, 0);
}

function visiblePlayerValue(state: GameState, playerId: string): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return -Infinity;
  const championValue = player.champion
    ? player.champion.health * 1.4 +
      (player.champion.maxHealth - player.champion.health) * 0.3
    : 0;
  return (
    player.health * 3.5 +
    boardValue(player) +
    championValue +
    player.currentGold * 1.1 +
    player.hand.reduce(
      (sum, card) => sum + 0.6 + Math.max(0, estimateCardValue(card)) * 0.12,
      0,
    ) -
    Math.max(0, player.hand.length - 7) * 1.5
  );
}

export function evaluateState(state: GameState, playerId: string): number {
  const opponentId = state.players.find(
    (candidate) => candidate.id !== playerId,
  )?.id;
  if (!opponentId) return -Infinity;
  if (state.status === "FINISHED") {
    if (state.winnerId === playerId) return 100000;
    if (state.loserId === playerId) return -100000;
  }
  return (
    visiblePlayerValue(state, playerId) - visiblePlayerValue(state, opponentId)
  );
}

/** Search uses visible board and own hand only. Hidden identities, deck order and seed are discarded. */
export function aiInformationState(
  state: GameState,
  playerId: string,
): GameState {
  const hidden = (index: number): CardInstance => ({
    instanceId: `unknown:${index}`,
    definitionId: "unknown",
    cardType: "WRESTLER",
    baseCost: 3,
    currentCost: 3,
    baseAttack: 2,
    currentAttack: 2,
    baseHealth: 3,
    currentHealth: 3,
    maxHealth: 3,
    boardSlot: null,
    enteredThisTurn: false,
    attacksUsedThisTurn: 0,
    isGenerated: false,
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [],
    isSilenced: false,
    isSilenceImmune: false,
    dodgeAvailable: false,
    dodgeCharges: 0,
    isStunned: false,
    activeUsedThisTurn: false,
    isDirectDeployedChampion: false,
  });
  const cache = new WeakMap<GameState, GameState>();
  const frame = (
    f: GameState["targetingState"],
  ): GameState["targetingState"] =>
    f
      ? {
          ...f,
          playRollback: f.playRollback ? mask(f.playRollback) : undefined,
          continuation: frame(f.continuation),
        }
      : undefined;
  function mask(current: GameState): GameState {
    const prior = cache.get(current);
    if (prior) return prior;
    // A tutor's current choice exposes those own-deck cards to the player.
    // Preserve that choice, but canonicalize its order so future draws stay unknown.
    const revealed =
      current.targetingState?.playerId === playerId
        ? new Set(current.targetingState.validTargetIds)
        : new Set<string>();
    const next: GameState = {
      ...current,
      randomSeed: 0,
      players: current.players.map((p, i) => ({
        ...p,
        hand:
          p.id === playerId
            ? p.hand
            : p.hand.map((_, n) => hidden(i * 1000 + n)),
        deck:
          p.id === playerId && p.deck.some((c) => revealed.has(c.instanceId))
            ? [
                ...p.deck
                  .filter((c) => !revealed.has(c.instanceId))
                  .map((_, n) => hidden(i * 1000 + n + 100)),
                ...p.deck
                  .filter((c) => revealed.has(c.instanceId))
                  .sort((a, b) => a.instanceId.localeCompare(b.instanceId)),
              ]
            : p.deck.map((_, n) => hidden(i * 1000 + n + 100)),
      })),
    };
    cache.set(current, next);
    next.targetingState = frame(current.targetingState);
    return next;
  }
  return mask(state);
}

/** Estimate visible next-turn attack exposure, including cheap attacks clearing fragile guards. */
function visibleAttackExposure(own: PlayerState, enemy: PlayerState): number {
  const guards = own.board
    .filter((card): card is CardInstance =>
      Boolean(card && getActiveCardKeywords(card).includes("TAUNT")),
    )
    .map((card) => ({
      health: card.currentHealth,
      attack: card.currentAttack,
      dodge: card.dodgeAvailable,
    }));
  const attackers = enemy.board
    .filter((card): card is CardInstance =>
      Boolean(
        card &&
        card.currentHealth > 0 &&
        !card.isStunned &&
        !getActiveCardKeywords(card).includes("CANNOT_ATTACK") &&
        card.currentAttack > 0,
      ),
    )
    .sort((left, right) => left.currentAttack - right.currentAttack);
  let exposure = 0;
  for (const attacker of attackers) {
    let health = attacker.currentHealth;
    const strikes = getActiveCardKeywords(attacker).includes("MULTI_STRIKE")
      ? 2
      : 1;
    for (let strike = 0; strike < strikes && health > 0; strike++) {
      guards.sort(
        (left, right) =>
          left.health - right.health || left.attack - right.attack,
      );
      const guard = guards[0];
      if (!guard) {
        exposure += attacker.currentAttack;
        continue;
      }
      if (guard.dodge) {
        guard.dodge = false;
        continue;
      }
      guard.health -= attacker.currentAttack;
      health -= guard.attack;
      if (guard.health <= 0) guards.shift();
    }
  }
  return exposure;
}

export function evaluateAction(
  state: GameState,
  action: GameAction,
  playerId: string,
): number {
  if (isMinionAAbility(state, action))
    return canUseChampionAbility(state, playerId) ? 3 : -Infinity;
  const visible = aiInformationState(state, playerId);
  const result = executeAction(visible, action);
  if (!result.success) return -Infinity;
  if (result.state.status === "FINISHED")
    return result.state.winnerId === playerId ? 100000 : -100000;
  return scoreTransition(visible, result.state, action, playerId);
}

function scoreTransition(
  visible: GameState,
  afterState: GameState,
  action: GameAction,
  playerId: string,
): number {
  const before = evaluateState(visible, playerId);
  const after = evaluateState(afterState, playerId);
  const ownBefore = visible.players.find((p) => p.id === playerId)!;
  const ownAfter = afterState.players.find((p) => p.id === playerId)!;
  const questBonus =
    ((ownAfter.champion?.questProgress ?? 0) -
      (ownBefore.champion?.questProgress ?? 0)) *
      2 +
    (ownAfter.champion?.questCompleted && !ownBefore.champion?.questCompleted
      ? 15
      : 0);
  const drawBonus =
    Math.max(0, ownAfter.hand.length - ownBefore.hand.length) *
    Math.max(0, 5 - ownBefore.hand.length);
  const spent = Math.max(0, ownBefore.currentGold - ownAfter.currentGold);
  const enemyThreat = afterState.players
    .find((p) => p.id !== playerId)!
    .board.reduce((n, c) => n + (c && !c.isStunned ? c.currentAttack : 0), 0);
  const exposure =
    hasAwakeningInvulnerability(afterState, playerId) ||
    isChampionProtectedByToken(afterState, playerId)
      ? 0
      : visibleAttackExposure(
          ownAfter,
          afterState.players.find((p) => p.id !== playerId)!,
        );
  // Visible next-turn lethal outranks optional nonlethal face damage.
  const exposedLethal = exposure >= ownAfter.health && exposure > 0 ? -5000 : 0;
  const survival =
    exposedLethal +
    (!(
      hasAwakeningInvulnerability(afterState, playerId) ||
      isChampionProtectedByToken(afterState, playerId)
    ) && ownAfter.health <= enemyThreat
      ? (ownAfter.health - ownBefore.health) * 3 - enemyThreat * 0.5
      : 0);
  const awakeningTargetBonus =
    action.type === "ATTACK"
      ? action.target.type === "PLAYER"
        ? hasAwakeningInvulnerability(visible, action.target.playerId)
          ? -12
          : 0
        : visible.players.find((p) => p.id === action.target.playerId)?.champion
              ?.awakening?.activeStageInstanceId ===
            action.target.cardInstanceId
          ? 6
          : 0
      : 0;
  return (
    after -
    before +
    questBonus +
    drawBonus -
    spent * 0.25 +
    survival +
    awakeningTargetBonus +
    (action.type === "END_TURN" ? -0.5 : 0)
  );
}

export type AIDifficulty = "EASY" | "NORMAL" | "HARD" | "BOSS";
export const DEFAULT_AI_DIFFICULTY = "BOSS" as const;
export const AI_SEARCH_PROFILES = {
  EASY: { depth: 1, width: 1, budget: 64 },
  NORMAL: { depth: 1, width: 4, budget: 96 },
  HARD: { depth: 4, width: 5, budget: 240 },
  BOSS: { depth: 8, width: 8, budget: 640 },
} as const;
export type AISearchStats = {
  simulations: number;
  replySimulations: number;
  reachedDepth: number;
  lethalDepth?: number;
};

/** Cheap ordering only; all chosen candidates are then verified by the real engine. */
function actionPriority(
  state: GameState,
  action: GameAction,
  playerId: string,
): number {
  const own = state.players.find((p) => p.id === playerId)!;
  if (action.type === "END_TURN") return -1000;
  if (
    action.type === "EMOTE" ||
    action.type === "SURRENDER" ||
    action.type === "CANCEL_EFFECT_TARGET"
  )
    return -10000;
  if (action.type === "ATTACK") {
    const attacker = own.board.find(
      (c) => c?.instanceId === action.attackerInstanceId,
    );
    if (!attacker) return -10000;
    if (action.target.type === "PLAYER")
      return attacker.currentAttack >=
        state.players.find((p) => p.id !== playerId)!.health
        ? 10000
        : attacker.currentAttack * 3;
    const targetId = action.target.cardInstanceId;
    const victim = state.players
      .flatMap((p) => p.board)
      .find((c) => c?.instanceId === targetId);
    return victim
      ? (attacker.currentAttack >= victim.currentHealth
          ? estimateCardValue(victim)
          : 0) +
          Math.min(attacker.currentAttack, victim.currentHealth) -
          (victim.currentAttack >= attacker.currentHealth
            ? estimateCardValue(attacker)
            : 0)
      : -1000;
  }
  if (
    action.type === "SELECT_EFFECT_TARGET" ||
    action.type === "CONFIRM_PRECOMMIT_TARGET"
  ) {
    const target = state.players
      .flatMap((p) => [...p.board, ...p.hand])
      .find((c) => c?.instanceId === action.targetId);
    return target
      ? estimateCardValue(target) *
          (state.targetingState?.handAddition ? -1 : 1)
      : 5;
  }
  const id = "cardInstanceId" in action ? action.cardInstanceId : undefined;
  const card = [...own.hand, ...own.board].find((c) => c?.instanceId === id);
  if (card)
    return (
      Math.max(0, estimateCardValue(card)) +
      abilityValue(card) -
      card.currentCost
    );
  return 8;
}

/** Interleave equivalent placement variants so one card cannot consume the shortlist. */
function orderedActions(
  state: GameState,
  actions: GameAction[],
  playerId: string,
): GameAction[] {
  const sorted = actions
    .filter(
      (a) =>
        a.type !== "EMOTE" &&
        a.type !== "SURRENDER" &&
        a.type !== "CANCEL_EFFECT_TARGET",
    )
    .map((action, index) => ({
      action,
      index,
      priority: actionPriority(state, action, playerId),
    }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index);
  const seen = new Set<string>(),
    first: GameAction[] = [],
    rest: GameAction[] = [];
  for (const { action } of sorted) {
    const key =
      action.type === "PLAY_WRESTLER"
        ? action.type + ":" + action.cardInstanceId
        : JSON.stringify(action);
    if (seen.has(key)) rest.push(action);
    else {
      seen.add(key);
      first.push(action);
    }
  }
  return [...first, ...rest];
}

/** Public board/ability replies only: never invent plays from the opponent's hidden hand. */
function publicReplyPenalty(
  state: GameState,
  playerId: string,
  stats: AISearchStats,
): number {
  if (state.targetingState?.active || state.status !== "IN_PROGRESS") return 0;
  let end = state;
  if (end.activePlayerId === playerId) {
    const r = executeAction(end, { type: "END_TURN", playerId });
    stats.replySimulations++;
    if (!r.success) return 0;
    end = r.state;
  }
  if (end.status === "FINISHED")
    return end.winnerId === playerId ? 100000 : -100000;
  const enemyId = end.players.find((p) => p.id !== playerId)!.id;
  if (end.activePlayerId !== enemyId) return 0;
  const base = evaluateState(state, playerId);
  let worst = evaluateState(end, playerId) - base;
  let beam = [end],
    budget = 24;
  for (let depth = 0; depth < 3 && beam.length && budget > 0; depth++) {
    const next: GameState[] = [];
    for (const s of beam) {
      const chooser = s.targetingState?.active
        ? s.targetingState.playerId
        : enemyId;
      if (chooser !== enemyId) continue;
      const actions = orderedActions(
        s,
        getLegalActions(s, enemyId).filter(
          (a) =>
            a.type === "ATTACK" ||
            a.type === "USE_ACTIVE" ||
            a.type === "USE_CHAMPION_ABILITY" ||
            a.type === "SELECT_EFFECT_TARGET" ||
            a.type === "CONFIRM_PRECOMMIT_TARGET",
        ),
        enemyId,
      ).slice(0, 4);
      for (const a of actions) {
        if (budget <= 0) break;
        budget--;
        if (isMinionAAbility(s, a)) continue;
        stats.replySimulations++;
        const r = executeAction(s, a);
        if (!r.success) continue;
        if (r.state.status === "FINISHED" && r.state.loserId === playerId)
          return -100000;
        worst = Math.min(worst, evaluateState(r.state, playerId) - base);
        next.push(r.state);
      }
    }
    beam = next
      .sort((a, b) => evaluateState(a, playerId) - evaluateState(b, playerId))
      .slice(0, 3);
  }
  return Math.min(0, worst);
}

/** Deterministic node budgets keep browser and server decisions identical. No wall-clock cutoff. */
export function chooseBestAction(
  state: GameState,
  actions: GameAction[],
  playerId: string,
  difficulty: AIDifficulty = DEFAULT_AI_DIFFICULTY,
  diagnostics?: AISearchStats,
): GameAction {
  if (
    state.targetingState?.active &&
    actions.some(
      (a) =>
        a.type === "SELECT_EFFECT_TARGET" ||
        a.type === "CONFIRM_PRECOMMIT_TARGET",
    )
  )
    actions = actions.filter((a) => a.type !== "CANCEL_EFFECT_TARGET");
  const stats: AISearchStats = diagnostics ?? {
    simulations: 0,
    replySimulations: 0,
    reachedDepth: 0,
  };
  Object.assign(stats, {
    simulations: 0,
    replySimulations: 0,
    reachedDepth: 0,
    lethalDepth: 0,
  });
  const visible = aiInformationState(state, playerId),
    profile = AI_SEARCH_PROFILES[difficulty];
  type Node = {
    first: GameAction;
    state: GameState;
    score: number;
    depth: number;
  };
  function simulate(
    s: GameState,
    a: GameAction,
  ): { state: GameState; score: number } | null {
    if (stats.simulations >= profile.budget) return null;
    stats.simulations++;
    // A random Minion A card is unknown at decision time; do not preview its roll.
    if (isMinionAAbility(s, a))
      return {
        state: s,
        score: canUseChampionAbility(s, playerId) ? 3 : -Infinity,
      };
    const r = executeAction(s, a);
    if (!r.success) return null;
    return {
      state: r.state,
      score:
        r.state.status === "FINISHED"
          ? r.state.winnerId === playerId
            ? 100000
            : -100000
          : scoreTransition(s, r.state, a, playerId),
    };
  }
  const roots: Node[] = [];
  for (const a of orderedActions(visible, actions, playerId)) {
    const r = simulate(visible, a);
    if (!r) continue;
    if (r.state.status === "FINISHED" && r.state.winnerId === playerId) {
      stats.lethalDepth = 1;
      return a;
    }
    roots.push({ first: a, ...r, depth: 1 });
  }
  roots.sort((a, b) => b.score - a.score);
  const fallback = roots[0]?.first ??
    actions[0] ?? { type: "END_TURN" as const, playerId };
  if (profile.depth === 1) return fallback;
  let best = roots[0],
    beam = roots.slice(0, profile.width);
  const finalists: Node[] = [...beam];
  for (
    let depth = 1;
    depth < profile.depth && beam.length && stats.simulations < profile.budget;
    depth++
  ) {
    const expanded: Node[] = [];
    const allowance = Math.max(
      4,
      Math.floor(
        (profile.budget - stats.simulations) /
          ((profile.depth - depth) * beam.length),
      ),
    );
    for (const node of beam) {
      if (
        node.state.status !== "IN_PROGRESS" ||
        node.first.type === "END_TURN" ||
        isMinionAAbility(visible, node.first)
      )
        continue;
      const chooser = node.state.targetingState?.active
        ? node.state.targetingState.playerId
        : node.state.activePlayerId;
      if (chooser !== playerId) continue;
      const legal = orderedActions(
        node.state,
        getLegalActions(node.state, playerId),
        playerId,
      )
        .filter((a) => a.type !== "END_TURN")
        .slice(0, allowance);
      for (const a of legal) {
        const r = simulate(node.state, a);
        if (!r) continue;
        stats.reachedDepth = Math.max(stats.reachedDepth, depth + 1);
        if (r.state.status === "FINISHED" && r.state.winnerId === playerId) {
          stats.lethalDepth = depth + 1;
          return node.first;
        }
        const child = {
          first: node.first,
          state: r.state,
          score: node.score + r.score * Math.pow(0.94, depth),
          depth: depth + 1,
        };
        if (!best || child.score > best.score) best = child;
        if (!isMinionAAbility(node.state, a)) expanded.push(child);
      }
    }
    beam = expanded.sort((a, b) => b.score - a.score).slice(0, profile.width);
    finalists.push(...beam.slice(0, 3));
  }
  if (difficulty !== "BOSS") return best?.first ?? fallback;
  // Compare the best continuation of each first action, then stress-test its public reply.
  const byFirst = new Map<string, Node>();
  for (const node of finalists) {
    const key = JSON.stringify(node.first),
      prior = byFirst.get(key);
    if (!prior || node.score > prior.score) byFirst.set(key, node);
  }
  const candidates = [...byFirst.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  let selected: GameAction = fallback,
    score = -Infinity;
  for (const n of candidates) {
    const value = n.score + publicReplyPenalty(n.state, playerId, stats);
    if (value > score) {
      score = value;
      selected = n.first;
    }
  }
  return selected;
}

export function rankActions(
  state: GameState,
  actions: GameAction[],
  playerId: string,
) {
  return actions
    .map((action, index) => ({
      action,
      score: evaluateAction(state, action, playerId),
      index,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}
