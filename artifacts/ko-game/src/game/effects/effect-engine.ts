import type { CardDefinition, CardInstance, CardStatHistoryEntry } from '../cards/types';
import { matchesCardTagFilter } from '../cards/tags';
import type { CardAbility, CardEffect, CardKeyword, QueuedStructuredEffect } from './types';
import {
  RUNTIME_HANDLER_ACTIONS,
  type Action,
  type EffectDuration,
  type EffectScript,
  type ScriptStep,
  type ScriptHistoryQuery,
  type ScriptTarget,
  type ScriptValue,
  SCRIPT_MAX_SELECTOR_RESULTS,
  type TargetZone,
} from "@workspace/effect-registry";

// The executor supports exactly the action IDs advertised by the shared library.
// Adding an advertised action requires this assertion (and the executor) to be updated.
const RUNTIME_STRUCTURED_ACTIONS = RUNTIME_HANDLER_ACTIONS satisfies readonly Action[];
type UnimplementedStructuredAction = Exclude<Action, typeof RUNTIME_STRUCTURED_ACTIONS[number]>;
const runtimeStructuredActionsAreExhaustive: UnimplementedStructuredAction extends never ? true : never = true;
void runtimeStructuredActionsAreExhaustive;
import type { GameState } from '../types/game-state';
import type { EventAttribution, LeaveReason } from '../events/types';
import { createDeterministicRandom, shuffle } from '../random/random';
import { destroyCard } from '../engine/destroy-card';
import { drawCard } from '../engine/draw-card';
import { silenceCard } from '../engine/card-status';
import { enterField } from '../engine/enter-field';
import { generateCard, generateCardInstance, getRandomCardGenerationCandidates, isEligibleForRandomPool } from '../cards/generation';
import { getAdjacentSlots } from '../engine/board-position';
import { deployLinkedChampionToken } from '../engine/champion-token';
import { isChampionProtectedByToken } from '../engine/direct-champion';
import { normalizeCardForZone, resetCardForGraveyard } from '../cards/zone-state';
import {
  getActiveCardAbilities,
  getActiveCardKeywords,
  grantCardText,
  isVanillaCard,
  removeGrantedCardText,
} from '../cards/granted-text';

/** The single authoritative target resolver.  UI must only display these ids. */
export function getValidTargets(
  state: GameState,
  playerId: string,
  sourceCard: CardInstance,
  effect: CardEffect,
): string[] {
  if (effect.type !== 'STRUCTURED' || !effect.target) return [];
  const target = effect.target;
  const zones = target.zones ?? (target.zone ? [target.zone] : []);
  if (zones.length === 1 && zones[0] === 'PLAYER') {
    if (target.owner === 'ALL') return [];
    const owner = target.owner === 'SELF' ? playerId : state.players.find((p) => p.id !== playerId)?.id;
    return owner && !isChampionProtectedByToken(state, owner) ? [owner] : [];
  }
  const owners = target.owner === 'ALL'
    ? state.players.map((player) => player.id)
    : [target.owner === 'SELF' ? playerId : state.players.find((p) => p.id !== playerId)?.id].filter((id): id is string => Boolean(id));
  const canTargetPlayer = zones.length === 1 && zones[0] === 'CHARACTER' &&
    !target.cardType &&
    (effect.action === 'DAMAGE' || (effect.action === 'HEAL' && target.owner !== 'ENEMY'));
  return owners.flatMap((owner) => {
    const player = state.players.find((candidate) => candidate.id === owner);
    if (!player) return [];
    const cards = cardsInZones(player, zones);
    const filteredCards = cards.filter((card) => {
      if (zones.length === 1 && zones[0] === 'CHARACTER' && card.cardType !== 'WRESTLER') return false;
      if (target.cardType && card.cardType !== target.cardType) return false;
      if (target.filter?.isGenerated !== undefined && card.isGenerated !== target.filter.isGenerated) return false;
      if (target.filter?.minCost !== undefined && card.currentCost < target.filter.minCost) return false;
      if (target.filter?.maxCost !== undefined && card.currentCost > target.filter.maxCost) return false;
      if (target.filter?.isToken !== undefined && card.isToken !== target.filter.isToken) return false;
      if (target.filter?.isChampionToken !== undefined && card.isChampionToken !== target.filter.isChampionToken) return false;
      if (target.filter?.excludeSource && card.instanceId === sourceCard.instanceId) return false;
      if (target.filter?.isVanilla && !isVanillaCard(card)) return false;
      if (target.filter?.definitionRef && !matchesDefinitionRef(state, card, target.filter.definitionRef)) return false;
      if (target.filter?.keyword !== undefined && !getActiveCardKeywords(card).includes(target.filter.keyword)) return false;
      if (target.filter?.cost && !scriptCompare(card.currentCost, target.filter.cost.compare, target.filter.cost.value)) return false;
      if (target.filter?.attack && !scriptCompare(card.currentAttack, target.filter.attack.compare, target.filter.attack.value)) return false;
      if (target.filter?.health && !scriptCompare(card.currentHealth, target.filter.health.compare, target.filter.health.value)) return false;
      if (!matchesCardTagFilter(card, target.filter)) return false;
      if (target.selection === 'RANDOM' && !isEligibleForRandomPool(card, target.randomScope)) return false;
      if (target.selection === 'SELF' && card.instanceId !== sourceCard.instanceId) return false;
      // Directly deployed champion tokens remain damageable, but not silence,
      // destroy, or remove-from-game targets.
      if (card.isDirectDeployedChampion && (
        effect.action === 'SILENCE' ||
        effect.action === 'DESTROY' ||
        effect.action === 'REMOVE_FROM_GAME'
      )) return false;
      return true;
    });
    const sourceBoardSlot = sourceCard.boardSlot;
    const adjacentCards = target.selection === 'ADJACENT' && sourceBoardSlot !== null
      ? filteredCards.filter((card) =>
        card.boardSlot !== null && getAdjacentSlots(sourceBoardSlot).includes(card.boardSlot),
      )
      : filteredCards;
    const orderedCards = sortAndTakeTargetCards(adjacentCards, target);
    const cardIds = orderedCards.map((card) => card.instanceId);
    return canTargetPlayer && !isChampionProtectedByToken(state, owner) ? [owner, ...cardIds] : cardIds;
  });
}

function cardsInZones(
  player: GameState['players'][number],
  zones: readonly TargetZone[],
): CardInstance[] {
  const cards = zones.flatMap((zone) => {
    if (zone === 'DECK') return player.deck;
    if (zone === 'HAND') return player.hand;
    if (zone === 'GRAVEYARD') return player.graveyard;
    if (zone === 'BOARD' || zone === 'CHARACTER') {
      return player.board.filter((card): card is CardInstance => card !== null);
    }
    return [];
  });
  return [...new Map(cards.map((card) => [card.instanceId, card])).values()];
}

function matchesDefinitionRef(
  state: GameState,
  card: CardInstance,
  reference: { id?: string; name?: string },
): boolean {
  if (reference.id && card.definitionId !== reference.id) return false;
  if (reference.name) {
    const definition = state.cardPool?.find((candidate) => candidate.id === card.definitionId);
    if (!definition || definition.name !== reference.name) return false;
  }
  return Boolean(reference.id || reference.name);
}

function sortAndTakeTargetCards<T extends CardInstance>(
  cards: readonly T[],
  target: { sort?: { stat: 'COST' | 'ATTACK' | 'HEALTH'; direction: 'ASC' | 'DESC' }; take?: number },
): T[] {
  const sorted = target.sort
    ? [...cards].sort((left, right) => {
      const leftValue = target.sort!.stat === 'COST'
        ? left.currentCost
        : target.sort!.stat === 'HEALTH' ? left.currentHealth : left.currentAttack;
      const rightValue = target.sort!.stat === 'COST'
        ? right.currentCost
        : target.sort!.stat === 'HEALTH' ? right.currentHealth : right.currentAttack;
      const delta = leftValue - rightValue;
      return (target.sort!.direction === 'ASC' ? delta : -delta) ||
        left.instanceId.localeCompare(right.instanceId);
    })
    : [...cards];
  return target.take === undefined ? sorted : sorted.slice(0, target.take);
}

type ScriptRegister = { ids: string[] } | { slots: number[] } | { value: number };
type ScriptRegisters = Map<string, ScriptRegister>;

function scriptZones(target: ScriptTarget): TargetZone[] {
  return target.zones ?? (target.zone ? [target.zone] : ['BOARD']);
}

function scriptTargetCards(
  state: GameState,
  playerId: string,
  sourceCard: CardInstance,
  target: ScriptTarget,
): CardInstance[] {
  const owners = target.owner === 'ALL'
    ? state.players
    : [state.players.find((player) => player.id === (target.owner === 'ENEMY'
      ? state.players.find((candidate) => candidate.id !== playerId)?.id
      : playerId))].filter((player): player is GameState['players'][number] => Boolean(player));
  const zones = scriptZones(target);
  const candidates = owners.flatMap((owner) => cardsInZones(owner, zones)).filter((card) => {
    if (target.cardType && card.cardType !== target.cardType) return false;
    const filter = target.filter;
    if (filter?.isGenerated !== undefined && card.isGenerated !== filter.isGenerated) return false;
    if (filter?.minCost !== undefined && card.currentCost < filter.minCost) return false;
    if (filter?.maxCost !== undefined && card.currentCost > filter.maxCost) return false;
    if (filter?.definitionRef && !matchesDefinitionRef(state, card, filter.definitionRef)) return false;
    if (filter?.isToken !== undefined && card.isToken !== filter.isToken) return false;
    if (filter?.isChampionToken !== undefined && card.isChampionToken !== filter.isChampionToken) return false;
    if (filter?.excludeSource && card.instanceId === sourceCard.instanceId) return false;
    if (filter?.isVanilla && !isVanillaCard(card)) return false;
    if (filter?.keyword !== undefined && !getActiveCardKeywords(card).includes(filter.keyword)) return false;
    const compare = (value: number, condition?: { compare: string; value: number }) =>
      !condition || scriptCompare(value, condition.compare, condition.value);
    if (!compare(card.currentCost, filter?.cost) ||
      !compare(card.currentAttack, filter?.attack) ||
      !compare(card.currentHealth, filter?.health)) return false;
    return matchesCardTagFilter(card, filter);
  });
  const selection = target.selection ?? 'ALL';
  const sorted = target.sort
    ? [...candidates].sort((left, right) => {
      const leftValue = target.sort!.stat === 'COST' ? left.currentCost : target.sort!.stat === 'HEALTH' ? left.currentHealth : left.currentAttack;
      const rightValue = target.sort!.stat === 'COST' ? right.currentCost : target.sort!.stat === 'HEALTH' ? right.currentHealth : right.currentAttack;
      const delta = leftValue - rightValue;
      return (target.sort!.direction === 'ASC' ? delta : -delta) || left.instanceId.localeCompare(right.instanceId);
    })
    : candidates;
  const taken = sorted.slice(0, target.take ?? sorted.length);
  if (selection === 'SELF') return taken.filter((card) => card.instanceId === sourceCard.instanceId);
  if (selection === 'TOP') return taken.slice(0, target.count ?? 1);
  if (selection === 'ALL') return taken;
  if (selection === 'ADJACENT') {
    return taken.filter((card) =>
      sourceCard.boardSlot !== null &&
      card.boardSlot !== null &&
      getAdjacentSlots(sourceCard.boardSlot).includes(card.boardSlot),
    ).slice(0, target.count ?? SCRIPT_MAX_SELECTOR_RESULTS);
  }
  if (selection === 'RANDOM') {
    return shuffle(
      taken.filter((card) => isEligibleForRandomPool(card, target.randomScope)),
      createDeterministicRandom(JSON.stringify({
        seed: state.randomSeed ?? 0,
        events: state.events.length,
        source: sourceCard.instanceId,
        scriptTarget: target,
      })),
    ).slice(0, target.count ?? 1);
  }
  return taken.slice(0, target.count ?? 1);
}

function scriptValue(registers: ScriptRegisters, value: ScriptValue): number {
  if (value.kind === 'CONSTANT') return value.value;
  const register = registers.get(value.resultId);
  const offset = value.offset ?? 0;
  if (!register || !('value' in register)) {
    return (register && 'ids' in register ? register.ids.length : register?.slots.length ?? 0) + offset;
  }
  return register.value + offset;
}

function historyValue(
  state: GameState,
  playerId: string,
  query: ScriptHistoryQuery,
): number {
  const turnStart = [...state.events].map((event, index) => ({ event, index }))
    .filter(({ event }) => event.type === 'TURN_STARTED' && event.playerId === playerId)
    .at(-1)?.index ?? 0;
  const start = query.scope === 'CURRENT_MATCH'
    ? 0
    : query.scope === 'CURRENT_TURN'
      ? turnStart + 1
      : Math.max(0, state.events.length - (query.scope === 'CURRENT_ACTION' ? 32 : 64));
  const enemyId = state.players.find((player) => player.id !== playerId)?.id;
  const events = state.events.slice(start).filter((event) => {
    if (event.type !== query.eventType) return false;
    if (query.cardType !== undefined && event.cardType !== query.cardType) return false;
    if (query.owner === 'SELF' && event.playerId !== playerId) return false;
    if (query.owner === 'ENEMY' && event.playerId !== enemyId) return false;
    if (query.tag !== undefined && !(event.tags ?? []).includes(query.tag)) return false;
    return true;
  });
  if (query.operation === 'COUNT') return Math.min(events.length, 64);
  const values = events.map((event) => event.amount ?? 1);
  if (query.operation === 'SUM') return Math.min(values.reduce((sum, value) => sum + value, 0), 999);
  if (!values.length) return 0;
  return query.operation === 'MIN' ? Math.min(...values) : Math.max(...values);
}

function scriptCompare(left: number, operator: string, right: number): boolean {
  if (operator === 'EQ') return left === right;
  if (operator === 'NE') return left !== right;
  if (operator === 'LT') return left < right;
  if (operator === 'LTE') return left <= right;
  if (operator === 'GT') return left > right;
  return left >= right;
}

function scriptEffectTarget(
  target: ScriptTarget | undefined,
  registers: ScriptRegisters,
): { target?: Extract<CardEffect, { type: 'STRUCTURED' }>['target']; selectedIds?: string[] } {
  if (!target) return {};
  const register = target.resultId ? registers.get(target.resultId) : undefined;
  if (target.resultId && register && 'slots' in register) {
    return {
      target: {
        zone: 'BOARD',
        owner: target.owner ?? 'SELF',
        selection: 'ADJACENT_EMPTY_SLOTS',
        count: register.slots.length,
      },
    };
  }
  const selectedIds = target.resultId && 'ids' in (registers.get(target.resultId) ?? {})
    ? (registers.get(target.resultId) as { ids: string[] }).ids
    : undefined;
  if (target.resultId) {
    return {
      target: {
        zone: target.zone ?? 'BOARD',
        zones: target.zones,
        owner: target.owner ?? 'SELF',
        cardType: target.cardType,
        filter: target.filter,
        selection: 'SAME_TARGET',
        count: selectedIds?.length ?? target.count ?? 1,
      },
      selectedIds,
    };
  }
  return {
    target: {
      zone: target.zone,
      zones: target.zones,
      owner: target.owner ?? 'SELF',
      cardType: target.cardType,
      filter: target.filter,
      selection: target.selection ?? 'ALL',
      count: target.count ?? 1,
      randomScope: target.randomScope,
    },
  };
}

function scriptEffectValues(
  values: Record<string, unknown> | undefined,
  registers: ScriptRegisters,
): Extract<CardEffect, { type: 'STRUCTURED' }>['values'] {
  if (!values) return undefined;
  const resolved = { ...values } as Record<string, unknown>;
  for (const [key, expressionKey] of [
    ['amount', 'amountExpression'],
    ['attack', 'attackExpression'],
    ['health', 'healthExpression'],
    ['count', 'countExpression'],
  ] as const) {
    const expression = resolved[expressionKey];
    if (expression && typeof expression === 'object') resolved[key] = scriptValue(registers, expression as ScriptValue);
    delete resolved[expressionKey];
  }
  return resolved as Extract<CardEffect, { type: 'STRUCTURED' }>['values'];
}

function applyScriptSteps(
  state: GameState,
  playerId: string,
  sourceCard: CardInstance,
  steps: ScriptStep[],
  registers: ScriptRegisters,
  depth = 0,
  script?: EffectScript,
  parentContinuation?: NonNullable<GameState['targetingState']>,
): GameState {
  if (depth > 6 || steps.length > 32) throw new Error('SCRIPT_V1 execution budget exceeded.');
  let next = state;
  for (const [stepIndex, step] of steps.entries()) {
    if (step.type === 'SELECT') {
      if (step.target.selection === 'ADJACENT_EMPTY_SLOTS') {
        const slots = sourceCard.boardSlot === null
          ? []
          : getAdjacentSlots(sourceCard.boardSlot).filter((slot) =>
            state.players.find((player) => player.id === playerId)?.board[slot] === null,
          );
        registers.set(step.id, { slots });
        continue;
      }
      if (step.target.selection === 'PLAYER_CHOICE') {
        const validTargetIds = scriptTargetCards(next, playerId, sourceCard, {
          ...step.target,
          selection: 'ALL',
        }).map((card) => card.instanceId);
        const minimum = step.target.count ?? 1;
        if (validTargetIds.length < minimum) continue;
        const registerObject = Object.fromEntries(registers.entries());
        return {
          ...next,
          targetingState: {
            active: true,
            playerId,
            sourceInstanceId: sourceCard.instanceId,
            sourceCard,
            effects: [],
            effectIndex: 0,
            selectedTargetIds: [],
            lastTargetIds: [],
            validTargetIds,
            minTargets: minimum,
            maxTargets: step.target.count ?? minimum,
            mandatory: true,
            cancelable: false,
            continuation: parentContinuation,
            scriptContinuation: {
              selectedResultId: step.id,
              remainingSteps: steps.slice(stepIndex + 1),
              registers: registerObject,
              script: script!,
            },
          },
        };
      }
      registers.set(step.id, { ids: scriptTargetCards(next, playerId, sourceCard, step.target).map((card) => card.instanceId) });
      continue;
    }
    if (step.type === 'AGGREGATE') {
      const selected = registers.get(step.selectionId);
      const ids = selected && 'ids' in selected ? selected.ids : [];
      const cards = ids.map((id) => sourceInState(next, id)).filter((card): card is CardInstance => Boolean(card));
      if (step.operation === 'COUNT') {
        registers.set(step.id, { value: cards.length });
        continue;
      }
      const values = cards.map((card) =>
        step.stat === 'COST' ? card.currentCost : step.stat === 'HEALTH' ? card.currentHealth : card.currentAttack,
      );
      const value = step.operation === 'SUM'
        ? values.reduce((sum, item) => sum + item, 0)
        : step.operation === 'MIN'
          ? (values.length ? Math.min(...values) : 0)
          : (values.length ? Math.max(...values) : 0);
      registers.set(step.id, { value });
      continue;
    }
    if (step.type === 'HISTORY') {
      registers.set(step.id, { value: historyValue(next, playerId, step.query) });
      continue;
    }
    if (step.type === 'IF') {
      const branch = scriptCompare(
        scriptValue(registers, step.condition.left),
        step.condition.compare,
        scriptValue(registers, step.condition.right),
      ) ? step.then : (step.else ?? []);
      return applyScriptSteps(
        next,
        playerId,
        sourceCard,
        [...branch, ...steps.slice(stepIndex + 1)],
        registers,
        depth + 1,
        script,
        parentContinuation,
      );
    }
    const { target, selectedIds } = scriptEffectTarget(step.effect.target, registers);
    const effect: CardEffect = {
      type: 'STRUCTURED',
      action: step.effect.action,
      target,
      values: scriptEffectValues(step.effect.values, registers),
    };
    next = applyEffect(next, playerId, sourceCard, effect, selectedIds);
    if (step.id) {
      const resultIds = next.targetingState?.lastTargetIds ?? [];
      registers.set(step.id, { ids: [...resultIds] });
    }
  }
  return next;
}

function applyScript(
  state: GameState,
  playerId: string,
  sourceCard: CardInstance,
  script: EffectScript,
): GameState {
  const parentContinuation = state.targetingState?.active
    ? {
      ...state.targetingState,
      effectIndex: state.targetingState.effectIndex + 1,
      selectedTargetIds: [],
      validTargetIds: [],
      minTargets: 0,
      maxTargets: 0,
    }
    : undefined;
  return applyScriptSteps(state, playerId, sourceCard, script.steps, new Map(), 0, script, parentContinuation);
}

export function getDamageModifierBonus(
  state: GameState,
  playerId: string,
  sourceCard: CardInstance,
): number {
  const owner = state.players.find((player) => player.id === playerId);
  if (!owner) return 0;

  return owner.board.reduce((bonus, card) => {
    if (!card || card.isSilenced) return bonus;
    const aura = getActiveCardAbilities(card)
      .flatMap((ability) => ability.effects)
      .filter((effect): effect is Extract<CardEffect, { type: 'STRUCTURED' }> =>
        effect.type === 'STRUCTURED' && effect.action === 'ADD_DAMAGE_MODIFIER',
      )
      .filter((effect) => effect.values?.damageSource === 'ALL' ||
        (effect.values?.damageSource === 'GENERATED' && sourceCard.isGenerated))
      .reduce((sum, effect) => sum + (effect.values?.amount ?? 0), 0);
    return bonus + aura;
  }, 0);
}

export function validateEffectTargets(
  state: GameState, playerId: string, sourceCard: CardInstance, effect: CardEffect, ids: string[],
): boolean {
  if (effect.type !== 'STRUCTURED' || !effect.target) return ids.length === 0;
  const min = effect.target.minTargets ?? effect.target.count;
  const max = effect.target.maxTargets ?? effect.target.count;
  return ids.length >= min && ids.length <= max && new Set(ids).size === ids.length &&
    ids.every((id) => getValidTargets(state, playerId, sourceCard, effect).includes(id));
}

function sourceInState(state: GameState, id: string): CardInstance | undefined {
  return state.players.flatMap((player) => [...player.deck, ...player.hand, ...player.board.filter((c): c is CardInstance => c !== null), ...player.graveyard])
    .find((card) => card.instanceId === id);
}

function queuedEffectCardEffect(effect: QueuedStructuredEffect): Extract<CardEffect, { type: 'STRUCTURED' }> {
  return {
    type: 'STRUCTURED',
    action: effect.action,
    target: effect.target,
    values: effect.values,
  };
}

function applyQueuedRuleEffect(
  state: GameState,
  playerId: string,
  source: CardInstance,
  effect: QueuedStructuredEffect,
  lastTargetIds: string[] = [],
): { state: GameState; lastTargetIds: string[] } {
  const chosen = effect.target?.selection === 'SAME_TARGET' ? lastTargetIds : undefined;
  const reviveOwnerId = effect.action === 'REVIVE'
    ? (effect.target?.owner === 'SELF'
      ? playerId
      : state.players.find((player) => player.id !== playerId)?.id)
    : undefined;
  const graveyardIdsBeforeRevive = reviveOwnerId
    ? new Set(state.players.find((player) => player.id === reviveOwnerId)?.graveyard.map((card) => card.instanceId))
    : undefined;
  const next = applyEffect(state, playerId, source, queuedEffectCardEffect(effect), chosen);
  const resolved = next.targetingState?.active && next.targetingState !== state.targetingState
    ? resolvePendingEffects(next)
    : next;
  if (graveyardIdsBeforeRevive && reviveOwnerId) {
    const ownerAfterRevive = resolved.players.find((player) => player.id === reviveOwnerId);
    const stillInGraveyard = new Set(ownerAfterRevive?.graveyard.map((card) => card.instanceId));
    const revivedIds = ownerAfterRevive?.board
      .filter((card): card is CardInstance => card !== null && graveyardIdsBeforeRevive.has(card.instanceId))
      .map((card) => card.instanceId)
      .filter((instanceId) => !stillInGraveyard.has(instanceId)) ?? [];
    if (revivedIds.length) return { state: resolved, lastTargetIds: revivedIds };
  }
  return {
    state: resolved,
    lastTargetIds: resolved.targetingState?.lastTargetIds ?? lastTargetIds,
  };
}

function applyQueuedRuleSequence(
  state: GameState,
  pending: {
    playerId: string;
    sourceInstanceId: string;
    sourceCard?: CardInstance;
    effect: QueuedStructuredEffect;
    followUpEffects?: QueuedStructuredEffect[];
  },
): GameState {
  const source = sourceInState(state, pending.sourceInstanceId) ?? pending.sourceCard;
  if (!source) return state;
  let next = applyQueuedRuleEffect(state, pending.playerId, source, pending.effect);
  for (const effect of pending.followUpEffects ?? []) {
    next = applyQueuedRuleEffect(next.state, pending.playerId, source, effect, next.lastTargetIds);
  }
  return next.state;
}

export function resolveRegisteredRuleListeners(
  state: GameState,
  trigger: 'CARD_PLAYED' | 'TECHNIQUE_PLAYED' | 'CARD_RETIRED' | 'DAMAGE_TAKEN',
  eventPlayerId: string,
  eventCardInstanceId?: string,
  eventCardType?: 'WRESTLER' | 'TECHNIQUE',
): GameState {
  const eventIndex = Math.max(0, state.events.length - 1);
  let next = state;
  const dueDelayed = (next.pendingDelayedEffects ?? []).filter((pending) =>
    (pending.schedule === 'NEXT_MATCHING_EVENT' || pending.schedule === 'N_MATCHING_EVENTS') &&
    pending.eventTrigger === trigger &&
    eventIndex >= 0,
  );
  if (dueDelayed.length) {
    next = {
      ...next,
      pendingDelayedEffects: (next.pendingDelayedEffects ?? []).filter((pending) => !dueDelayed.includes(pending)),
    };
    for (const pending of dueDelayed.slice(0, 32)) {
      next = applyQueuedRuleSequence(next, pending);
      if (pending.schedule === 'N_MATCHING_EVENTS' && (pending.remainingMatches ?? 1) > 1) {
        next = {
          ...next,
          pendingDelayedEffects: [
            ...(next.pendingDelayedEffects ?? []),
            { ...pending, remainingMatches: (pending.remainingMatches ?? 1) - 1 },
          ],
        };
      }
    }
  }

  const activeListeners = (next.pendingRuleListeners ?? []).filter((listener) =>
    next.players.some((player) => player.board.some((card) => card?.instanceId === listener.sourceInstanceId)),
  );
  next = { ...next, pendingRuleListeners: activeListeners };
  const listeners = activeListeners.filter((listener) =>
    listener.trigger === trigger &&
    eventIndex > listener.registeredEventIndex &&
    (listener.owner === undefined ||
      (listener.owner === 'SELF' ? listener.playerId === eventPlayerId : listener.playerId !== eventPlayerId)) &&
    (listener.cardType === undefined || listener.cardType === eventCardType),
  );
  if (!listeners.length) return next;
  const listenerIds = new Set(listeners.map((listener) => listener.id));
  next = {
    ...next,
    pendingRuleListeners: (next.pendingRuleListeners ?? []).filter((listener) => {
      if (!listenerIds.has(listener.id)) return true;
      return listener.uses !== 1;
    }),
  };
  for (const listener of listeners.slice(0, 32)) {
    const source = sourceInState(next, listener.sourceInstanceId);
    const eventCard = eventCardInstanceId ? sourceInState(next, eventCardInstanceId) : undefined;
    if (!source && !eventCard) continue;
    const effectSource = eventCard ?? source!;
    next = applyQueuedRuleEffect(next, listener.playerId, effectSource, listener.effect).state;
  }
  return next;
}

export function resolveDueDelayedEffects(
  state: GameState,
  trigger: 'TURN_START' | 'TURN_END',
  playerId: string,
): GameState {
  const pendingDelayedEffects = state.pendingDelayedEffects ?? [];
  const due = pendingDelayedEffects.filter((pending) => {
    if (pending.schedule === 'END_OF_CURRENT_TURN') return trigger === 'TURN_END' && pending.dueTurn <= state.turn;
    if (trigger !== 'TURN_START' || pending.dueTurn > state.turn) return false;
    if (pending.schedule === 'OWNER_NEXT_TURN_START') return pending.playerId === playerId;
    if (pending.schedule === 'OPPONENT_NEXT_TURN_START') return pending.playerId !== playerId;
    return false;
  });
  if (!due.length) return state;
  let next = {
    ...state,
    pendingDelayedEffects: pendingDelayedEffects.filter((pending) => !due.includes(pending)),
  };
  for (const pending of due.slice(0, 32)) next = applyQueuedRuleSequence(next, pending);
  return next;
}

function withLastAggregatedStats(
  state: GameState,
  stats: { attack: number; health: number },
): GameState {
  return {
    ...state,
    lastAggregatedStats: stats,
    ...(state.targetingState
      ? { targetingState: { ...state.targetingState, lastAggregatedStats: stats } }
      : {}),
  };
}

function clearLastAggregatedStats(state: GameState): GameState {
  const next = { ...state, lastAggregatedStats: undefined };
  if (!state.targetingState?.lastAggregatedStats) return next;
  const { lastAggregatedStats: _unused, ...targetingState } = state.targetingState;
  return { ...next, targetingState };
}

function lastRetiredSnapshot(state: GameState): { attack: number; health: number } | undefined {
  const event = [...state.events].reverse().find((entry) => entry.type === 'CARD_RETIRED');
  if (event?.targetSnapshot?.currentAttack !== undefined && event.targetSnapshot.currentHealth !== undefined) {
    return { attack: event.targetSnapshot.currentAttack, health: event.targetSnapshot.currentHealth };
  }
  const cardInstanceId = event?.target?.type === 'CARD' ? event.target.cardInstanceId : undefined;
  if (cardInstanceId) {
    const snapshot = state.players
      .flatMap((player) => player.graveyard)
      .find((card) => card.instanceId === cardInstanceId)
      ?.lastRetiredStats;
    if (snapshot) return snapshot;
  }
  return state.players.flatMap((player) => player.graveyard)
    .map((card) => card.lastRetiredStats)
    .filter((snapshot): snapshot is { attack: number; health: number } => Boolean(snapshot))
    .at(-1);
}

function resolveCardDefinition(
  state: GameState,
  definition: CardDefinition | undefined,
  reference: { id?: string; name?: string } | undefined,
): CardDefinition | undefined {
  if (definition) return definition;
  if (!reference?.id) return undefined;
  return state.cardPool?.find((candidate) => candidate.id === reference.id);
}

type TriggerContext = NonNullable<GameState['targetingState']>['triggerContext'];

function damageCausedTargetRetire(
  state: GameState,
  sourceCard: CardInstance,
): boolean {
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    const event = state.events[index];
    if (event?.type !== 'DAMAGE_DEALT' ||
        event.reason !== 'CARD_EFFECT' ||
        event.amount === undefined ||
        event.amount <= 0 ||
        event.source?.type !== 'CARD' ||
        event.source.cardInstanceId !== sourceCard.instanceId ||
        event.target?.type !== 'CARD') {
      continue;
    }
    const damageTargetId = event.target.cardInstanceId;
    return state.events.slice(index + 1).some((candidate) =>
      candidate.type === 'CARD_RETIRED' &&
      candidate.source?.type === 'CARD' &&
      candidate.source.cardInstanceId === sourceCard.instanceId &&
      candidate.target?.type === 'CARD' &&
      candidate.target.cardInstanceId === damageTargetId,
    );
  }
  return false;
}

function sourceContextFor(
  playerId: string,
  sourceCard: CardInstance,
  triggerContext?: TriggerContext,
): EventAttribution {
  return triggerContext?.sourceContext ?? {
    sourcePlayerId: playerId,
    sourceActionType: 'CARD_EFFECT',
    sourceEffectId: sourceCard.definitionId,
  };
}

function recordStatChanges(
  before: CardInstance,
  after: CardInstance,
  state: GameState,
  sourceCard: CardInstance,
  triggerContext?: TriggerContext,
  duration?: EffectDuration,
): CardInstance {
  const fields: Array<[keyof CardInstance, CardStatHistoryEntry['stat']]> = [
    ['currentCost', 'cost'],
    ['currentAttack', 'attack'],
    ['currentHealth', 'currentHealth'],
    ['maxHealth', 'maxHealth'],
  ];
  const changes = fields.flatMap(([field, stat]) => {
    const previous = before[field];
    const next = after[field];
    if (typeof previous !== 'number' || typeof next !== 'number' || previous === next) return [];
    return [{
      stat,
      before: previous,
      after: next,
      delta: next - previous,
      sourceDefinitionId: sourceCard.definitionId,
      sourceInstanceId: sourceCard.instanceId,
      sourceName: state.cardPool?.find((definition) => definition.id === sourceCard.definitionId)?.name ?? sourceCard.definitionId,
      sourceEffectId: triggerContext?.sourceContext?.sourceEffectId,
      turnNumber: state.turn,
      ...(duration ? { duration } : {}),
    }];
  });
  return changes.length
    ? { ...after, statHistory: [...(before.statHistory ?? []), ...changes] }
    : after;
}

function statChangeEvents(
  beforeState: GameState,
  afterState: GameState,
  sourceCard: CardInstance,
  sourceContext: EventAttribution,
  duration?: EffectDuration,
): GameState['events'] {
  const beforeCards = new Map(allCardsWithOwners(beforeState).map(({ card }) => [card.instanceId, card]));
  return allCardsWithOwners(afterState).flatMap(({ ownerId, card }) => {
    const before = beforeCards.get(card.instanceId);
    if (!before) return [];
    const fields: Array<[keyof CardInstance, CardStatHistoryEntry['stat']]> = [
      ['currentCost', 'cost'],
      ['currentAttack', 'attack'],
      ['maxHealth', 'maxHealth'],
      ['currentHealth', 'currentHealth'],
    ];
    return fields.flatMap(([field, stat]) => {
      const previous = before[field];
      const next = card[field];
      if (typeof previous !== 'number' || typeof next !== 'number' || previous === next) return [];
      return [{
        type: 'STAT_CHANGED' as const,
        playerId: ownerId,
        cardInstanceId: card.instanceId,
        source: { type: 'CARD' as const, cardInstanceId: sourceCard.instanceId },
        target: { type: 'CARD' as const, cardInstanceId: card.instanceId },
        reason: 'STAT_CHANGED',
        stat,
        before: previous,
        after: next,
        delta: next - previous,
        duration,
        sourceContext,
      }];
    });
  });
}

function allCardsWithOwners(state: GameState): Array<{ ownerId: string; card: CardInstance }> {
  return state.players.flatMap((player) => [
    ...player.deck,
    ...player.hand,
    ...player.board.filter((card): card is CardInstance => card !== null),
    ...player.graveyard,
  ].map((card) => ({ ownerId: player.id, card })));
}

function statListenerCards(state: GameState): Array<{ ownerId: string; card: CardInstance }> {
  return state.players.flatMap((player) => [
    ...player.hand,
    ...player.board.filter((card): card is CardInstance => card !== null),
  ].map((card) => ({ ownerId: player.id, card })));
}

function resolveStatChangeListeners(
  beforeState: GameState,
  afterState: GameState,
  sourceContext?: EventAttribution,
): GameState {
  if (sourceContext?.sourceActionType === 'INTERNAL_STAT_LISTENER') return afterState;
  const beforeCards = new Map(statListenerCards(beforeState).map(({ card }) => [card.instanceId, card]));
  const alreadyTriggered = new Set(beforeState.targetingState?.statChangedCardIds ?? []);
  const changed = statListenerCards(afterState).flatMap(({ ownerId, card }) => {
    if (alreadyTriggered.has(card.instanceId)) return [];
    const before = beforeCards.get(card.instanceId);
    const attackDelta = before ? card.currentAttack - before.currentAttack : 0;
    const healthDelta = before ? card.currentHealth - before.currentHealth : 0;
    const maxHealthDelta = before ? card.maxHealth - before.maxHealth : 0;
    return attackDelta > 0 || healthDelta > 0 || maxHealthDelta > 0
      ? [{ ownerId, card, attackDelta, healthDelta: Math.max(healthDelta, maxHealthDelta) }]
      : [];
  });
  const resolved = changed.reduce((next, changedCard) => {
    return statListenerCards(next)
      .filter(({ card }) => card.instanceId === changedCard.card.instanceId)
      .filter(({ card }) => getActiveCardAbilities(card).some((ability) => ability.trigger === 'STAT_CHANGED'))
      .reduce((listenerState, { ownerId, card }) => {
        const listenerFrame = listenerState.targetingState;
        const hasChoice = getActiveCardAbilities(card)
          .filter((ability) => ability.trigger === 'STAT_CHANGED')
          .some((ability) => ability.effects.some((effect) =>
            effect.type === 'STRUCTURED' && effect.target?.selection === 'PLAYER_CHOICE',
          ));
        const listenerInput = listenerFrame && !hasChoice
          ? { ...listenerState, targetingState: undefined }
          : listenerState;
        const resolved = resolveTriggeredAbilities(
          listenerInput,
          ownerId,
          card,
          'STAT_CHANGED',
          {
            attackDelta: changedCard.attackDelta,
            sourceContext: {
              ...(sourceContext ?? {
                sourcePlayerId: changedCard.ownerId,
                sourceActionType: 'CARD_EFFECT',
              }),
              sourceActionType: 'INTERNAL_STAT_LISTENER',
            },
            healthDelta: changedCard.healthDelta,
          },
        );
        return listenerFrame && !hasChoice
          ? { ...resolved, targetingState: listenerFrame }
          : resolved;
      }, next);
  }, afterState);
  return resolved.targetingState && changed.length
    ? {
        ...resolved,
        targetingState: {
          ...resolved.targetingState,
          statChangedCardIds: [...new Set([...(resolved.targetingState.statChangedCardIds ?? []), ...changed.map((entry) => entry.card.instanceId)])],
        },
      }
    : resolved;
}

function withTemporaryStatDeltas(
  before: CardInstance,
  after: CardInstance,
  stateTurn: number,
  duration?: EffectDuration,
): CardInstance {
  if (!duration || duration === 'PERMANENT') return after;
  const untilTurn = duration === 'THIS_TURN' ? stateTurn : stateTurn + 1;
  const deltas: CardInstance['temporaryStatModifiers'] = [
    { stat: 'cost' as const, amount: after.currentCost - before.currentCost, untilTurn },
    { stat: 'attack' as const, amount: after.currentAttack - before.currentAttack, untilTurn },
    { stat: 'health' as const, amount: after.maxHealth - before.maxHealth, untilTurn },
  ].filter((modifier) => modifier.amount !== 0);
  return deltas.length
    ? { ...after, temporaryStatModifiers: [...(after.temporaryStatModifiers ?? []), ...deltas] }
    : after;
}

function dynamicValue(
  state: GameState,
  playerId: string,
  reference: NonNullable<Extract<CardEffect, { type: 'STRUCTURED' }>['values']>['amountReference'],
  triggerContext?: TriggerContext,
): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || !reference) return 0;
  if (reference === 'HAND_COUNT') return player.hand.length;
  if (reference === 'GRAVEYARD_WRESTLER_COUNT') return player.graveyard.filter((card) => card.cardType === 'WRESTLER').length;
  if (reference === 'BOARD_WRESTLER_COUNT') return player.board.filter((card) => card?.cardType === 'WRESTLER').length;
  if (reference === 'LAST_ATTACK_DELTA') return triggerContext?.attackDelta ?? 0;
  if (reference === 'CURRENT_TURN_RETIRED_WRESTLER_COUNT') {
    const turnStart = [...state.events].map((event, index) => ({ event, index }))
      .filter(({ event }) => event.type === 'TURN_STARTED' && event.playerId === playerId)
      .at(-1)?.index ?? 0;
    return state.events.slice(turnStart + 1).filter((event) =>
      event.type === 'CARD_RETIRED' && event.cardType === 'WRESTLER' && event.playerId === playerId,
    ).length;
  }
  if (reference === 'CURRENT_TURN_DAMAGE_TAKEN') {
    const turnStart = [...state.events].map((event, index) => ({ event, index }))
      .filter(({ event }) => event.type === 'TURN_STARTED' && event.playerId === playerId)
      .at(-1)?.index ?? 0;
    return state.events.slice(turnStart + 1)
      .filter((event) => event.type === 'DAMAGE_DEALT' && event.target?.type === 'PLAYER' && event.target.playerId === playerId)
      .reduce((total, event) => total + (event.amount ?? 0), 0);
  }
  return player.currentGold;
}

function referenceStatValue(
  state: GameState,
  context: TriggerContext | undefined,
  reference: NonNullable<Extract<CardEffect, { type: 'STRUCTURED' }>['values']>['reference'],
  stat: NonNullable<Extract<CardEffect, { type: 'STRUCTURED' }>['values']>['referenceStat'],
): number {
  if (reference === 'LAST_TARGET' && state.targetingState?.lastAggregatedStats) {
    return stat === 'CURRENT_HEALTH'
      ? state.targetingState.lastAggregatedStats.health
      : state.targetingState.lastAggregatedStats.attack;
  }
  const referencedId = reference === 'LAST_ATTACKER' ? context?.attackerInstanceId : undefined;
  if (!referencedId) return 0;
  const referencedCard = sourceInState(state, referencedId);
  if (!referencedCard) return 0;
  return stat === 'CURRENT_HEALTH' ? referencedCard.currentHealth : referencedCard.currentAttack;
}

function randomForEffect(
  state: GameState,
  sourceCard: CardInstance,
  effect: CardEffect,
): ReturnType<typeof createDeterministicRandom> {
  return createDeterministicRandom(JSON.stringify({
    seed: state.randomSeed ?? 0,
    events: state.events.length,
    source: sourceCard.instanceId,
    action: effect.type === 'STRUCTURED' ? effect.action : effect.type,
    target: effect.type === 'STRUCTURED' ? effect.target : undefined,
  }));
}

function definitionsFromState(state: GameState): CardDefinition[] {
  const byDefinition = new Map<string, CardDefinition>();
  for (const card of state.players.flatMap((player) => [
    ...player.deck,
    ...player.hand,
    ...player.board.filter((item): item is CardInstance => item !== null),
    ...player.graveyard,
    ...player.removedFromGame,
  ])) {
    if (byDefinition.has(card.definitionId)) continue;
    byDefinition.set(card.definitionId, {
      id: card.definitionId,
      name: card.definitionId,
      cardType: card.cardType,
      cost: card.baseCost ?? card.currentCost,
      attack: card.baseAttack ?? card.currentAttack,
      health: card.baseHealth ?? card.maxHealth,
      rulesText: '',
      isToken: card.isToken,
      isChampionToken: card.isChampionToken,
      keywords: [...card.keywords],
      abilities: [...card.abilities],
      tags: card.tags ? [...card.tags] : [],
    });
  }
  return [...byDefinition.values()];
}

function selectRandomDefinitions(
  definitions: readonly CardDefinition[],
  count: number,
  random: ReturnType<typeof createDeterministicRandom>,
): CardDefinition[] {
  if (!definitions.length || count <= 0) return [];
  return Array.from({ length: count }, () => definitions[Math.floor(random() * definitions.length)]!);
}

function containsGrantAction(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsGrantAction);
  const record = value as Record<string, unknown>;
  if (record.action === 'GRANT_RANDOM_CARD_TEXT') return true;
  return Object.values(record).some(containsGrantAction);
}

function randomTextDonorCandidates(state: GameState): CardDefinition[] {
  return (state.cardPool ?? [])
    .filter((definition) =>
      definition.cardType === 'WRESTLER' &&
      (definition.status ?? 'PUBLISHED') === 'PUBLISHED' &&
      (definition.keywords.length > 0 || definition.abilities.length > 0) &&
      !containsGrantAction(definition.abilities),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function grantRandomCardText(
  state: GameState,
  playerId: string,
  sourceCard: CardInstance,
  targets: readonly CardInstance[],
  effect: Extract<CardEffect, { type: 'STRUCTURED' }>,
): GameState {
  const donors = randomTextDonorCandidates(state);
  if (!donors.length) return state;
  const random = createDeterministicRandom(JSON.stringify({
    seed: state.randomSeed ?? 0,
    events: state.events.length,
    source: sourceCard.instanceId,
    action: effect.action,
    targets: targets.map((card) => card.instanceId),
  }));
  let next = state;
  for (const target of targets) {
    const donor = donors[Math.floor(random() * donors.length)]!;
    const owner = next.players.find((player) =>
      player.board.some((card) => card?.instanceId === target.instanceId) ||
      player.hand.some((card) => card.instanceId === target.instanceId) ||
      player.deck.some((card) => card.instanceId === target.instanceId) ||
      player.graveyard.some((card) => card.instanceId === target.instanceId),
    );
    if (!owner) continue;
    const updated = grantCardText(target, donor);
    const isOnBoard = target.boardSlot !== null;
    next = {
      ...next,
      players: next.players.map((player) => player.id !== owner.id ? player : {
        ...player,
        hand: player.hand.map((card) => card.instanceId === target.instanceId ? normalizeCardForZone(updated, 'HAND') : card),
        deck: player.deck.map((card) => card.instanceId === target.instanceId ? normalizeCardForZone(updated, 'DECK') : card),
        graveyard: player.graveyard.map((card) => card.instanceId === target.instanceId ? updated : card),
        board: player.board.map((card) => card?.instanceId === target.instanceId ? updated : card) as typeof player.board,
      }),
      events: [...next.events, {
        type: 'CARD_TEXT_GRANTED',
        playerId,
        cardInstanceId: target.instanceId,
        cardType: target.cardType,
        source: { type: 'CARD', cardInstanceId: sourceCard.instanceId },
        target: { type: 'CARD', cardInstanceId: target.instanceId },
        reason: 'GRANT_RANDOM_CARD_TEXT',
        grantedFromDefinitionId: donor.id,
      }],
    };
    if (isOnBoard) {
      const grantedOnly = { ...updated, abilities: [], keywords: [] };
      const enterEffects = getActiveCardAbilities(grantedOnly)
        .filter((ability) => ability.trigger === 'ENTER_FIELD')
        .flatMap((ability) => ability.effects);
      if (enterEffects.length) {
        next = resolveTriggeredAbilities(next, owner.id, grantedOnly, 'ENTER_FIELD');
      }
    }
  }
  return next;
}

function setLastTargetIds(state: GameState, ids: string[]): GameState {
  return state.targetingState
    ? { ...state, targetingState: { ...state.targetingState, lastTargetIds: ids } }
    : state;
}

function applyRandomCardCreation(
  state: GameState,
  playerId: string,
  sourceCard: CardInstance,
  effect: Extract<CardEffect, { type: 'STRUCTURED' }>,
): GameState {
  const target = effect.target;
  if (!target || target.selection !== 'RANDOM') return state;
  const definitions = getRandomCardGenerationCandidates(
    state.cardPool ?? definitionsFromState(state),
    {
      randomScope: target.randomScope,
      cardType: target.cardType,
      filter: target.filter,
    },
  );
  const selected = shuffle(
    definitions,
    randomForEffect(state, sourceCard, effect),
  ).slice(0, Math.max(0, target.count));
  const summonedIds: string[] = [];

  const result = selected.reduce((nextState, definition) => {
    const generated = generateCard(definition, {
      instanceId: `${sourceCard.instanceId}:${effect.action}:${nextState.events.length}`,
      playerId,
      source: { type: 'CARD', cardInstanceId: sourceCard.instanceId },
      reason: effect.action,
      sourceDefinitionId: sourceCard.definitionId,
      creationEventIndex: nextState.events.length,
      statModifiers: effect.values?.generatedModifiers
        ? {
            cost: effect.values.generatedModifiers.cost,
            attack: effect.values.generatedModifiers.attack,
            health: effect.values.generatedModifiers.health,
            ...(effect.values.generatedModifiers.copySourceStats
              ? { copySourceStats: { attack: sourceCard.currentAttack, health: sourceCard.currentHealth } }
              : {}),
          }
        : undefined,
    });
    if (effect.action === 'GENERATE') {
      const generatedCard = normalizeCardForZone(
        generated.card,
        effect.values?.destination === 'DECK' ? 'DECK' : 'HAND',
      );
      return {
        ...nextState,
        players: nextState.players.map((player) => player.id === playerId
          ? effect.values?.destination === 'DECK'
            ? effect.values.deckPosition === 'TOP'
              ? { ...player, deck: [generatedCard, ...player.deck] }
              : { ...player, deck: [...player.deck, generatedCard] }
            : { ...player, hand: [...player.hand, generatedCard] }
          : player),
        events: [...nextState.events, generated.event],
      };
    }
    const owner = nextState.players.find((player) => player.id === playerId);
    const slot = owner?.board.findIndex((card) => card === null) ?? -1;
    if (slot < 0) return nextState;
    const entered = enterField(
      { ...nextState, events: [...nextState.events, generated.event] },
      playerId,
      generated.card,
      slot as 0 | 1 | 2 | 3,
      {
        type: 'CARD',
        cardInstanceId: sourceCard.instanceId,
      },
      undefined,
      'SUMMON',
    );
    summonedIds.push(generated.card.instanceId);
    return entered;
  }, setLastTargetIds(state, []));
  return effect.action === 'SUMMON' ? setLastTargetIds(result, summonedIds) : result;
}

function applyAdjacentRandomCardCreation(
  state: GameState,
  playerId: string,
  sourceCard: CardInstance,
  effect: Extract<CardEffect, { type: 'STRUCTURED' }>,
): GameState {
  const target = effect.target;
  const owner = state.players.find((player) => player.id === playerId);
  if (!target || target.selection !== 'ADJACENT_EMPTY_SLOTS' || !owner || sourceCard.boardSlot === null) return state;
  const slots = getAdjacentSlots(sourceCard.boardSlot)
    .filter((slot) => owner.board[slot] === null)
    .slice(0, Math.max(0, target.count));
  const definitions = getRandomCardGenerationCandidates(state.cardPool ?? definitionsFromState(state), {
    randomScope: target.randomScope,
    cardType: target.cardType,
    filter: target.filter,
  });
  const selected = selectRandomDefinitions(
    definitions,
    slots.length,
    randomForEffect(state, sourceCard, effect),
  );

  const summonedIds: string[] = [];
  const nextState = selected.reduce((currentState, definition, index) => {
    const generated = generateCard(definition, {
      instanceId: `${sourceCard.instanceId}:${effect.action}:${currentState.events.length}`,
      playerId,
      source: { type: 'CARD', cardInstanceId: sourceCard.instanceId },
      reason: effect.action,
      sourceDefinitionId: sourceCard.definitionId,
      creationEventIndex: currentState.events.length,
    });
    const entered = enterField(
      { ...currentState, events: [...currentState.events, generated.event] },
      playerId,
      generated.card,
      slots[index]!,
      { type: 'CARD', cardInstanceId: sourceCard.instanceId },
      undefined,
      'SUMMON',
    );
    if (entered.players.find((player) => player.id === playerId)?.board[slots[index]!]?.instanceId === generated.card.instanceId) {
      summonedIds.push(generated.card.instanceId);
    }
    return entered;
  }, state);
  return setLastTargetIds(nextState, summonedIds);
}

function applyRandomTargetSummon(
  state: GameState,
  playerId: string,
  sourceCard: CardInstance,
  effect: Extract<CardEffect, { type: 'STRUCTURED' }>,
): GameState {
  const target = effect.target;
  const definition = resolveCardDefinition(state, effect.values?.definition, effect.values?.definitionRef);
  if (!target || !definition || target.selection !== 'RANDOM') return state;
  const zones = target.zones ?? (target.zone ? [target.zone] : []);
  const validTargetIds = new Set(getValidTargets(state, playerId, sourceCard, effect));
  const candidates = state.players
    .flatMap((owner) => cardsInZones(owner, zones))
    .filter((card) => validTargetIds.has(card.instanceId));
  const selected = shuffle(candidates, randomForEffect(state, sourceCard, effect))
    .slice(0, Math.max(0, target.count));
  let nextState = setLastTargetIds(state, []);
  const summonedIds: string[] = [];
  for (const selectedCard of selected) {
    const currentOwner = nextState.players.find((player) => player.id === playerId);
    const slot = currentOwner?.board.findIndex((card) => card === null) ?? -1;
    if (slot < 0) break;
    const generated = generateCard(definition, {
      instanceId: `${sourceCard.instanceId}:${effect.action}:${nextState.events.length}`,
      playerId,
      source: { type: 'CARD', cardInstanceId: sourceCard.instanceId },
      reason: effect.action,
      sourceDefinitionId: sourceCard.definitionId,
      creationEventIndex: nextState.events.length,
      isGenerated: true,
      statModifiers: {
        ...(effect.values?.generatedModifiers?.cost !== undefined ? { cost: effect.values.generatedModifiers.cost } : {}),
        ...(effect.values?.generatedModifiers?.attack !== undefined ? { attack: effect.values.generatedModifiers.attack } : {}),
        ...(effect.values?.generatedModifiers?.health !== undefined ? { health: effect.values.generatedModifiers.health } : {}),
        ...(effect.values?.generatedModifiers?.copyTargetStats
          ? { copySourceStats: { attack: selectedCard.currentAttack, health: selectedCard.currentHealth } }
          : {}),
      },
    });
    nextState = enterField(
      { ...nextState, events: [...nextState.events, generated.event] },
      playerId,
      generated.card,
      slot as 0 | 1 | 2 | 3,
      { type: 'CARD', cardInstanceId: sourceCard.instanceId },
      undefined,
      'SUMMON',
    );
    summonedIds.push(generated.card.instanceId);
  }
  return setLastTargetIds(nextState, summonedIds);
}

function beginResolution(state: GameState, frame: NonNullable<GameState['targetingState']>): GameState {
  return resolvePendingEffects({
    ...state,
    targetingState: {
      ...frame,
      // The parent has just executed the effect that caused this trigger.
      // Resume at the following effect after the child resolves, preventing
      // summon/enter chains from replaying the parent effect.
      continuation: state.targetingState?.active
        ? { ...state.targetingState, effectIndex: state.targetingState.effectIndex + 1 }
        : frame.continuation,
    },
  });
}

/** Append work after the current unresolved chain (rather than treating it as
 * a child trigger). Used for POSITION, which follows ENTER_FIELD. */
export function appendEffectContinuation(
  state: GameState,
  frame: NonNullable<GameState['targetingState']>,
): GameState {
  const append = (current: NonNullable<GameState['targetingState']>): NonNullable<GameState['targetingState']> => ({
    ...current,
    continuation: current.continuation ? append(current.continuation) : frame,
  });
  return state.targetingState ? { ...state, targetingState: append(state.targetingState) } : beginResolution(state, frame);
}

/** Applies the generic state-based death rule after effect/stat resolution. */
export function resolveStateBasedDeaths(
  state: GameState,
  sourceContext?: EventAttribution,
): GameState {
  // Resolve all BEFORE_RETIRE replacements against the live board before
  // taking the lethal snapshot. This keeps state-based lethal damage
  // consistent with combat damage and structured DAMAGE.
  let preparedState = state;
  const candidateIds = state.players.flatMap((player) =>
    player.board
      .filter((card): card is CardInstance => card !== null && card.currentHealth <= 0)
      .map((card) => ({ playerId: player.id, cardInstanceId: card.instanceId })),
  );
  if (!candidateIds.length) return state;
  for (const candidate of candidateIds) {
    const player = preparedState.players.find((entry) => entry.id === candidate.playerId);
    const card = player?.board.find((entry) => entry?.instanceId === candidate.cardInstanceId);
    if (!card || card.currentHealth > 0) continue;
    const beforeRetire = resolveTriggeredAbilities(
      preparedState,
      candidate.playerId,
      card,
      'BEFORE_RETIRE',
      { sourceContext },
    );
    preparedState = beforeRetire !== preparedState && beforeRetire.targetingState?.active
      ? resolvePendingEffects(beforeRetire)
      : beforeRetire;
  }

  const retired: Array<{ playerId: string; card: CardInstance; slot: 0 | 1 | 2 | 3 }> = [];
  const players = preparedState.players.map((player) => {
    const board = [...player.board];
    const graveyard = [...player.graveyard];
    board.forEach((card, index) => {
      if (!card || card.currentHealth > 0 || preparedState.preventedRetireTargetIds?.includes(card.instanceId)) return;
      const slot = index as 0 | 1 | 2 | 3;
      retired.push({ playerId: player.id, card, slot });
      board[index] = null;
      graveyard.push(resetCardForGraveyard(card));
    });
    return { ...player, board: board as typeof player.board, graveyard };
  });
  const clearedInterceptions = {
    ...preparedState,
    preventedRetireTargetIds: undefined,
  };
  if (!retired.length) return clearedInterceptions;

  let next: GameState = {
    ...clearedInterceptions,
    players,
    events: [
      ...preparedState.events,
      ...retired.map(({ playerId, card, slot }) => ({
        type: 'CARD_RETIRED' as const,
        playerId,
        cardInstanceId: card.instanceId,
        cardType: card.cardType,
        boardSlot: slot,
        source: { type: 'SYSTEM' as const },
        target: { type: 'CARD' as const, cardInstanceId: card.instanceId },
        reason: 'RETIRE' as const,
        ...(sourceContext ? { sourceContext } : {}),
      })),
    ],
  };
  for (const entry of retired) {
    const beforeSelfRetire = next;
    next = resolveTriggeredAbilities(next, entry.playerId, entry.card, 'SELF_RETIRE', {
      leaveReason: 'RETIRE',
      sourceContext,
    });
    next = next !== beforeSelfRetire && next.targetingState?.active
      ? resolvePendingEffects(next)
      : next;
    next = resolveTriggeredAbilities(next, entry.playerId, entry.card, 'LEAVE_FIELD', {
      leaveReason: 'RETIRE',
      sourceContext,
    });
    next = resolveCardRetiredListeners(next, entry.playerId, entry.card, sourceContext);
  }
  return next;
}

export function resolvePendingEffects(state: GameState): GameState {
  const pending = state.targetingState;
  if (!pending) return state;
  // Keep this frame visible while automatic effects execute: a lethal/destroy
  // trigger can then install itself as a child continuation.
  let next: GameState = { ...state, targetingState: pending };
  let last = pending.lastTargetIds;
  let lastAggregatedStats = pending.lastAggregatedStats ?? state.lastAggregatedStats;
  for (let index = pending.effectIndex; index < pending.effects.length; index += 1) {
    const effect = pending.effects[index];
    const source = pending.sourceCard ?? sourceInState(next, pending.sourceInstanceId);
    if (!source) return next;
    if (effect.type === 'STRUCTURED' && effect.target?.selection === 'PLAYER_CHOICE') {
      const validTargetIds = getValidTargets(next, pending.playerId, source, effect);
      const minTargets = effect.target.minTargets ?? effect.target.count;
      const maxTargets = effect.target.maxTargets ?? effect.target.count;
      // A triggered effect can lose all of its candidates after the trigger
      // starts (for example, another nested effect may retire the last card).
      // Do not leave the match in an impossible targeting state.
      if (validTargetIds.length === 0 || validTargetIds.length < minTargets) {
        return resolvePendingEffects({
          ...next,
          targetingState: {
            ...pending,
            effectIndex: index + 1,
            selectedTargetIds: [],
            validTargetIds: [],
            minTargets: 0,
            maxTargets: 0,
          },
        });
      }
      return { ...next, targetingState: { ...pending, effectIndex: index, selectedTargetIds: [], lastTargetIds: last, validTargetIds, minTargets, maxTargets, mandatory: !effect.target.optionalTarget, cancelable: Boolean(effect.target.optionalTarget) } };
    }
    const ids = effect.type === 'STRUCTURED' && effect.target?.selection === 'SAME_TARGET' ? last : undefined;
    // Automatic effects do not pass through selectEffectTarget, so advance the
    // active frame before applying them. Otherwise a nested damage trigger sees
    // the same unresolved effect and re-enters resolvePendingEffects forever.
    const frameAfterCurrentEffect: NonNullable<GameState['targetingState']> = {
      ...pending,
      effectIndex: index + 1,
      selectedTargetIds: [],
      validTargetIds: [],
      minTargets: 0,
      maxTargets: 0,
      lastTargetIds: last,
      lastAggregatedStats,
      statChangedCardIds: next.targetingState?.statChangedCardIds ?? pending.statChangedCardIds,
    };
    next = applyEffect(
      { ...next, targetingState: frameAfterCurrentEffect },
      pending.playerId,
      source,
      effect,
      ids,
      pending.triggerContext,
    );
    lastAggregatedStats = next.lastAggregatedStats ?? next.targetingState?.lastAggregatedStats ?? lastAggregatedStats;
    if (next.targetingState?.continuation &&
      next.targetingState.continuation.sourceInstanceId === pending.sourceInstanceId &&
      next.targetingState.continuation.effectIndex > pending.effectIndex) return next;
    if (ids?.length) last = ids;
     if (next.targetingState?.sourceInstanceId === pending.sourceInstanceId) {
       last = next.targetingState.lastTargetIds;
      lastAggregatedStats = next.targetingState.lastAggregatedStats ?? next.lastAggregatedStats ?? lastAggregatedStats;
     }
  }
  if (pending.markActiveUsed) {
    next = {
      ...next,
      players: next.players.map((player) => ({
        ...player,
        board: player.board.map((card) => card?.instanceId === pending.sourceInstanceId
          ? { ...card, activeUsedThisTurn: true }
          : card) as typeof player.board,
      })),
    };
  }
  const settled = pending.continuation
    ? resolvePendingEffects({ ...next, targetingState: pending.continuation })
    : { ...next, targetingState: undefined };
  return resolveStateBasedDeaths(settled, pending.triggerContext?.sourceContext);
}

export function selectEffectTarget(state: GameState, targetId: string): GameState {
  const pending = state.targetingState;
  if (!pending) return state;
  if (pending.scriptContinuation) {
    if (!pending.validTargetIds.includes(targetId) || pending.selectedTargetIds.includes(targetId)) return state;
    const selected = [...pending.selectedTargetIds, targetId];
    if (selected.length < pending.minTargets) {
      return { ...state, targetingState: { ...pending, selectedTargetIds: selected } };
    }
    const registers = new Map<string, ScriptRegister>(
      Object.entries(pending.scriptContinuation.registers) as Array<[string, ScriptRegister]>,
    );
    registers.set(pending.scriptContinuation.selectedResultId, { ids: selected });
    const source = pending.sourceCard ?? sourceInState(state, pending.sourceInstanceId);
    if (!source) return state;
    let resumed = applyScriptSteps(
      { ...state, targetingState: pending },
      pending.playerId,
      source,
      pending.scriptContinuation.remainingSteps,
      registers,
      0,
      pending.scriptContinuation.script,
      pending.continuation,
    );
    if (
      resumed.targetingState?.scriptContinuation &&
      resumed.targetingState.scriptContinuation !== pending.scriptContinuation
    ) return resumed;
    if (resumed.targetingState) {
      const { scriptContinuation: _completedScript, ...completedFrame } = resumed.targetingState;
      resumed = { ...resumed, targetingState: completedFrame };
    }
    if (pending.continuation) return resolvePendingEffects({ ...resumed, targetingState: pending.continuation });
    return { ...resumed, targetingState: undefined };
  }
  const effect = pending.effects[pending.effectIndex];
  const source = pending.sourceCard ?? sourceInState(state, pending.sourceInstanceId);
  if (!source || !effect || !pending.validTargetIds.includes(targetId) || pending.selectedTargetIds.includes(targetId)) return state;
  const selected = [...pending.selectedTargetIds, targetId];
  if (selected.length < pending.minTargets) return { ...state, targetingState: { ...pending, selectedTargetIds: selected } };
  const parentAfter: NonNullable<GameState['targetingState']> = {
    ...pending, effectIndex: pending.effectIndex + 1, selectedTargetIds: [],
    lastTargetIds: selected, validTargetIds: [], minTargets: 0, maxTargets: 0,
  };
  let next: GameState = { ...state, targetingState: parentAfter };
  if (!validateEffectTargets(state, pending.playerId, source, effect, selected)) return state;
   next = applyEffect(next, pending.playerId, source, effect, selected, pending.triggerContext);
   if (next.targetingState?.continuation === parentAfter && next.targetingState.active) return next;
  return resolvePendingEffects(next);
}

/** Cancel the active target choice without rolling back committed game state. */
export function cancelEffectTargeting(state: GameState): GameState {
  const pending = state.targetingState;
  if (!pending) return state;
  if (pending.phase === 'PRE_COMMIT') return { ...state, targetingState: undefined };
  // Optional structured effects retain their normal continuation semantics.
  if (pending.cancelable) {
    if (pending.selectedTargetIds.length > 0) return state;
    return resolvePendingEffects({
      ...state,
      targetingState: {
        ...pending,
        effectIndex: pending.effectIndex + 1,
        selectedTargetIds: [],
        validTargetIds: [],
      },
    });
  }
  // Mandatory choices can be abandoned, but nothing already committed is
  // undone. Dropping the authoritative frame clears the input lock and any
  // nested/script continuation without restoring a prior snapshot.
  return { ...state, targetingState: undefined };
}

export function hasMandatoryPlayerChoice(state: GameState, playerId: string, source: CardInstance, effects: CardEffect[]): boolean {
  return effects.some((effect) => effect.type === 'STRUCTURED' && effect.target?.selection === 'PLAYER_CHOICE' &&
    !effect.target.optionalTarget && getValidTargets(state, playerId, source, effect).length < (effect.target.minTargets ?? effect.target.count));
}

export function hasKeyword(
  card: CardInstance,
  keyword: CardKeyword,
): boolean {
  return getActiveCardKeywords(card).includes(keyword);
}

export function getActiveAbility(
  card: CardInstance,
): Extract<CardAbility, { trigger: 'ACTIVE' }> | undefined {
  return card.isAbilityDisabled
    ? undefined
    : getActiveCardAbilities(card).find(
        (ability): ability is Extract<CardAbility, { trigger: 'ACTIVE' }> =>
          ability.trigger === 'ACTIVE',
      );
}

export function applyEffect(
  state: GameState,
  playerId: string,
  sourceCard: CardInstance,
  effect: CardEffect,
  chosenTargetInstanceIds?: string[],
  triggerContext?: TriggerContext,
): GameState {
  if (effect.type === 'SCRIPT') {
    return applyScript(state, playerId, sourceCard, effect.script);
  }
  if (effect.type === 'STRUCTURED') {
    if (effect.action === 'REPEAT_TURN_END') return state;
    if (effect.action === 'DEPLOY_CHAMPION_TOKEN') {
      return deployLinkedChampionToken(state, playerId);
    }
    if (effect.action === 'TRANSFORM_SOURCE') {
      if (effect.values?.causal === 'DAMAGE_CAUSED_TARGET_RETIRE' &&
          !damageCausedTargetRetire(state, sourceCard)) {
        return state;
      }
      const definition = resolveCardDefinition(state, effect.values?.definition, effect.values?.definitionRef);
      if (!definition) return state;
      const transformed = generateCard(definition, {
        instanceId: sourceCard.instanceId,
        playerId,
        source: { type: 'CARD', cardInstanceId: sourceCard.instanceId },
        reason: 'TRANSFORM_SOURCE',
        sourceDefinitionId: sourceCard.definitionId,
        creationEventIndex: state.events.length,
      }).card;
      const replacement = {
        ...transformed,
        instanceId: sourceCard.instanceId,
        boardSlot: sourceCard.boardSlot,
        enteredThisTurn: sourceCard.enteredThisTurn,
      };
      return {
        ...state,
        players: state.players.map((player) => ({
          ...player,
          deck: player.deck.map((card) => card.instanceId === sourceCard.instanceId ? normalizeCardForZone(replacement, 'DECK') : card),
          hand: player.hand.map((card) => card.instanceId === sourceCard.instanceId ? normalizeCardForZone(replacement, 'HAND') : card),
          board: player.board.map((card) => card?.instanceId === sourceCard.instanceId ? replacement : card) as typeof player.board,
        })),
      };
    }
    if (effect.action === 'SUMMON' && effect.target?.selection === 'ADJACENT_EMPTY_SLOTS') {
      return applyAdjacentRandomCardCreation(state, playerId, sourceCard, effect);
    }
    if (
      effect.action === 'SUMMON' &&
      effect.target?.selection === 'RANDOM' &&
      effect.values?.generatedModifiers?.copyTargetStats
    ) {
      return applyRandomTargetSummon(state, playerId, sourceCard, effect);
    }
    if ((effect.action === 'SUMMON' || effect.action === 'GENERATE') && effect.target?.selection === 'RANDOM') {
      return applyRandomCardCreation(state, playerId, sourceCard, effect);
    }
    const amount = effect.values?.amount ??
      dynamicValue(state, playerId, effect.values?.amountReference, triggerContext);
    const referenceAmount = effect.action === 'BUFF' && effect.values?.reference && effect.values.referenceStat
      ? referenceStatValue(state, triggerContext, effect.values.reference, effect.values.referenceStat)
      : 0;
    const damageAmount = effect.action === 'DAMAGE'
      ? amount + getDamageModifierBonus(state, playerId, sourceCard)
      : amount;
    const definition = resolveCardDefinition(state, effect.values?.definition, effect.values?.definitionRef);
    const validDefinition = definition &&
      typeof definition.id === 'string' && typeof definition.cost === 'number' &&
      typeof definition.attack === 'number' && typeof definition.health === 'number' &&
      Array.isArray(definition.keywords) && Array.isArray(definition.abilities);
    if (effect.action === 'SUMMON_FROM_HAND') {
      const owner = state.players.find((player) => player.id === playerId);
      const handCard = owner?.hand.find((card) =>
        effect.values?.definitionRef?.id
          ? card.definitionId === effect.values.definitionRef.id
          : effect.values?.definitionRef?.name
            ? state.cardPool?.find((definition) => definition.id === card.definitionId)?.name === effect.values.definitionRef.name
            : false,
      );
      const slot = owner?.board.findIndex((card) => card === null) ?? -1;
      if (!owner || !handCard || slot < 0) return state;
      const withoutHand = {
        ...state,
        players: state.players.map((player) => player.id === playerId
          ? { ...player, hand: player.hand.filter((card) => card.instanceId !== handCard.instanceId) }
          : player),
      };
      return enterField(withoutHand, playerId, handCard, slot as 0 | 1 | 2 | 3, {
        type: 'CARD',
        cardInstanceId: sourceCard.instanceId,
      }, undefined, 'SUMMON');
    }
    if (effect.action === 'SUMMON' || effect.action === 'GENERATE') {
      // These actions require a data-only definition; an absent/malformed
      // reference is a rejected effect, never an advertised silent no-op.
      if (!validDefinition) throw new Error(`${effect.action} requires a serializable card definition.`);
      const owner = state.players.find((player) => player.id === playerId);
      if (!owner) return state;
      const aggregate = effect.action === 'SUMMON' && effect.values?.aggregateStats?.source === 'LAST_DESTROYED_TARGETS'
        ? state.targetingState?.lastAggregatedStats
        : undefined;
      const generationCount = Math.max(1, Math.min(20, effect.values?.count ?? 1));
      const generatedCards = Array.from({ length: generationCount }, (_, index) => {
         const generated = generateCard(definition, {
          instanceId: `${sourceCard.instanceId}:${effect.action}:${state.events.length}:${index}`,
           playerId,
           source: { type: 'CARD', cardInstanceId: sourceCard.instanceId },
           reason: effect.action,
           sourceContext: sourceContextFor(playerId, sourceCard, triggerContext),
            sourceDefinitionId: sourceCard.definitionId,
            creationEventIndex: state.events.length,
            isGenerated: true,
          statModifiers: effect.values?.generatedModifiers
            ? {
                cost: effect.values.generatedModifiers.cost,
                attack: effect.values.generatedModifiers.attack,
                health: effect.values.generatedModifiers.health,
                ...(effect.values.generatedModifiers.copySourceStats
                  ? { copySourceStats: { attack: sourceCard.currentAttack, health: sourceCard.currentHealth } }
                  : {}),
              }
            : undefined,
        });
         const card = aggregate
          ? {
               ...generated.card,
              currentAttack: aggregate.attack,
              currentHealth: aggregate.health,
              maxHealth: aggregate.health,
            }
           : generated.card;
          return {
            card: effect.action === 'GENERATE'
              ? normalizeCardForZone(card, effect.values?.destination === 'DECK' ? 'DECK' : 'HAND')
              : card,
            event: generated.event,
          };
      });
      if (effect.action === 'GENERATE') {
        return setLastTargetIds({
          ...state,
          players: state.players.map((player) => player.id === playerId
            ? effect.values?.destination === 'DECK'
              ? effect.values?.deckPosition === 'TOP'
                ? { ...player, deck: [...generatedCards.map(({ card }) => card), ...player.deck] }
                : { ...player, deck: [...player.deck, ...generatedCards.map(({ card }) => card)] }
              : { ...player, hand: [...player.hand, ...generatedCards.map(({ card }) => card)] }
            : player),
          events: [...state.events, ...generatedCards.map(({ event }) => event)],
        }, generatedCards.map(({ card }) => card.instanceId));
      }
       let summonState = setLastTargetIds(clearLastAggregatedStats(state), []);
       const summonedIds: string[] = [];
      for (const generated of generatedCards) {
        const currentOwner = summonState.players.find((player) => player.id === playerId);
        const slot = currentOwner?.board.findIndex((card) => card === null) ?? -1;
        if (slot < 0) break;
         summonState = {
           ...summonState,
           events: [...summonState.events, generated.event],
         };
         summonState = enterField(summonState, playerId, generated.card, slot as 0 | 1 | 2 | 3,
           { type: 'CARD', cardInstanceId: sourceCard.instanceId }, undefined, 'SUMMON');
         summonedIds.push(generated.card.instanceId);
      }
       return setLastTargetIds(summonState, summonedIds);
    }
    if (effect.action === 'SWITCH_EFFECT_BRANCH') {
      const branch = sourceCard.boardSlot !== null && sourceCard.boardSlot <= 1
        ? effect.values?.leftEffects : effect.values?.rightEffects;
      if (!branch || !Array.isArray(branch)) throw new Error('SWITCH_EFFECT_BRANCH requires leftEffects and rightEffects.');
       return branch.reduce((next, child) => applyEffect(next, playerId, sourceCard, child, undefined, triggerContext), state);
    }
    if (effect.action === 'SPEND_GOLD_BUFF_SELF') {
      const player = state.players.find((candidate) => candidate.id === playerId);
      const spend = player?.currentGold ?? 0;
      if (!spend) return state;
      return applyEffect(
        { ...state, players: state.players.map((candidate) => candidate.id === playerId ? { ...candidate, currentGold: 0 } : candidate) },
        playerId,
        sourceCard,
        { type: 'STRUCTURED', action: 'BUFF', target: { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 }, values: { attack: spend * 2, health: spend * 2 } },
        undefined,
        triggerContext,
      );
    }
    if (effect.action === 'ADD_GOLD') {
      return applyEffect(state, playerId, sourceCard, { type: 'GAIN_GOLD', amount }, undefined, triggerContext);
    }
    if (effect.action === 'ADD_NEXT_TURN_GOLD') {
      return { ...state, players: state.players.map((player) => player.id === playerId ? { ...player, nextTurnGoldBonus: player.nextTurnGoldBonus + amount } : player) };
    }
    if (effect.action === 'QUEUE_EFFECT') {
      const queuedEffect = effect.values?.queuedEffect;
      if (
        effect.values?.queuedTrigger !== 'NEXT_ALLY_WRESTLER_PLAYED' &&
        effect.values?.queuedTrigger !== 'NEXT_TECHNIQUE_PLAYED'
      || !queuedEffect) {
        throw new Error('QUEUE_EFFECT requires a supported queue trigger and queued effect.');
      }
      return {
        ...state,
        pendingCardEffects: [
          ...(state.pendingCardEffects ?? []),
          {
            playerId,
            sourceInstanceId: sourceCard.instanceId,
            trigger: effect.values.queuedTrigger,
            effect: queuedEffect,
            registeredEventIndex: state.events.length - 1,
          },
        ],
      };
    }
    if (effect.action === 'REGISTER_DELAYED') {
      const delayed = effect.values?.delayed;
      if (!delayed) throw new Error('REGISTER_DELAYED requires a delayed schedule.');
      const ownerIsActivePlayer = state.activePlayerId === playerId;
      const dueTurn = delayed.kind === 'OWNER_NEXT_TURN_START'
        ? state.turn + (ownerIsActivePlayer ? state.players.length : 1)
        : delayed.kind === 'OPPONENT_NEXT_TURN_START'
          ? state.turn + (ownerIsActivePlayer ? 1 : state.players.length)
          : state.turn;
      return {
        ...state,
        pendingDelayedEffects: [
          ...(state.pendingDelayedEffects ?? []),
          {
            id: `${sourceCard.instanceId}:delayed:${state.events.length}:${(state.pendingDelayedEffects ?? []).length}`,
            playerId,
            sourceInstanceId: sourceCard.instanceId,
            sourceCard,
            schedule: delayed.kind,
            dueTurn,
            ...(delayed.count ? { remainingMatches: delayed.count } : {}),
            ...(delayed.eventTrigger ? { eventTrigger: delayed.eventTrigger } : {}),
            effect: delayed.effect,
            ...(delayed.followUpEffects ? { followUpEffects: delayed.followUpEffects } : {}),
          },
        ],
      };
    }
    if (effect.action === 'REGISTER_LISTENER') {
      const listener = effect.values?.listener;
      if (!listener) throw new Error('REGISTER_LISTENER requires a listener definition.');
      return {
        ...state,
        pendingRuleListeners: [
          ...(state.pendingRuleListeners ?? []),
          {
            id: `${sourceCard.instanceId}:listener:${state.events.length}:${(state.pendingRuleListeners ?? []).length}`,
            playerId,
            sourceInstanceId: sourceCard.instanceId,
            trigger: listener.trigger,
            ...(listener.owner ? { owner: listener.owner } : {}),
            ...(listener.cardType ? { cardType: listener.cardType } : {}),
            ...(listener.uses ? { uses: listener.uses } : {}),
            registeredEventIndex: state.events.length - 1,
            effect: listener.effect,
          },
        ],
      };
    }
    if (effect.action === 'PREVENT_DAMAGE') {
      const key = `${sourceCard.instanceId}:BEFORE_DAMAGE`;
      return {
        ...state,
        preventedDamageTargetIds: [...new Set([...(state.preventedDamageTargetIds ?? []), sourceCard.instanceId])],
        consumedRuleKeys: [...new Set([...(state.consumedRuleKeys ?? []), key])],
      };
    }
    if (effect.action === 'PREVENT_RETIRE') {
      const health = effect.values?.prevention?.setHealth ?? 1;
      const key = `${sourceCard.instanceId}:BEFORE_RETIRE`;
      return {
        ...state,
        players: state.players.map((player) => ({
          ...player,
          board: player.board.map((card) => card?.instanceId === sourceCard.instanceId
            ? { ...card, currentHealth: Math.max(1, health), maxHealth: Math.max(card.maxHealth, health) }
            : card) as typeof player.board,
        })),
        preventedRetireTargetIds: [...new Set([...(state.preventedRetireTargetIds ?? []), sourceCard.instanceId])],
        consumedRuleKeys: [...new Set([...(state.consumedRuleKeys ?? []), key])],
      };
    }
    if (effect.action === 'ADD_AGGREGATED_ATTACK') {
      const retiredId = state.targetingState?.lastTargetIds?.[0];
      const retiredSnapshot = retiredId
        ? state.players.flatMap((player) => player.graveyard).find((card) => card.instanceId === retiredId)?.lastRetiredStats
        : undefined;
      const aggregate = state.lastAggregatedStats ?? state.targetingState?.lastAggregatedStats ?? retiredSnapshot ?? lastRetiredSnapshot(state);
      if (!aggregate || !effect.target) return clearLastAggregatedStats(state);
    }
    if (effect.action === 'DRAW') {
      return Array.from({ length: amount }).reduce<GameState>(
        (nextState) => nextState.status === 'FINISHED' ? nextState : drawCard(nextState, playerId),
        state,
      );
    }
    if (effect.action === 'RELEASE_CAPTURED') {
      const owner = state.players.find((player) => player.id === playerId);
      const captured = sourceCard.capturedCards?.[0];
      const slot = owner?.board.findIndex((card) => card === null) ?? -1;
      if (!owner || !captured || slot < 0) return state;
      const released: CardInstance = {
        ...captured.baseSnapshot,
        instanceId: `${sourceCard.instanceId}:captured:${state.events.length}`,
        boardSlot: null, enteredThisTurn: false, attacksUsedThisTurn: 0,
        isSilenced: false, isSilenceImmune: false, dodgeAvailable: (captured.baseSnapshot.dodgeCharges ?? 0) > 0,
        dodgeCharges: captured.baseSnapshot.dodgeCharges ?? (getActiveCardKeywords(captured.baseSnapshot as CardInstance).includes('DODGE') ? 1 : 0),
        isStunned: false, activeUsedThisTurn: false, isDirectDeployedChampion: false, capturedCards: [],
      };
      const withoutCaptured = {
        ...state,
        players: state.players.map((player) => player.id !== playerId ? player : {
          ...player,
          board: player.board.map((card) => card?.instanceId === sourceCard.instanceId
            ? { ...card, capturedCards: card.capturedCards?.slice(1) ?? [] } : card) as typeof player.board,
        }),
      };
      return enterField(withoutCaptured, playerId, released, slot as 0 | 1 | 2 | 3, { type: 'CARD', cardInstanceId: sourceCard.instanceId }, undefined, 'SUMMON');
    }
    if (!effect.target) return state;
    const target = effect.target;
    // Costs belong to cards in hand, never to a character (which can include a
    // champion/player id). Keep malformed legacy payloads from changing board
    // cards through this broader target zone.
    const zones = target.zones ?? (target.zone ? [target.zone] : []);
    if (zones.length === 1 && zones[0] === 'CHARACTER' &&
      (effect.action === 'REDUCE_COST' || effect.action === 'INCREASE_COST')) return state;
    // `ALL` is a real target scope, not an alias for ENEMY. A PLAYER_CHOICE
    // effect can select a card on either side, so resolve each selected id
    // against its actual owner before entering the normal owner-specific path.
    // This keeps damage/retire/move semantics identical for SELF and ENEMY.
    if (target.owner === 'ALL') {
      if (
        target.selection === 'PLAYER_CHOICE' ||
        target.selection === 'SAME_TARGET' ||
        target.selection === 'ADJACENT'
      ) {
        const selectedIds = chosenTargetInstanceIds ?? [];
        return selectedIds.reduce((nextState, selectedId) => {
          const owner = nextState.players.find((player) =>
            player.board.some((card) => card?.instanceId === selectedId),
          );
          if (!owner) return nextState;
          return applyEffect(
            nextState,
            playerId,
            sourceCard,
            {
              ...effect,
              target: {
                ...target,
                owner: owner.id === playerId ? 'SELF' : 'ENEMY',
              },
            },
            [selectedId],
            triggerContext,
          );
        }, state);
      }
      if (target.selection === 'ALL') {
        if (zones.length === 1 && zones[0] === 'CHARACTER') {
          const selectedIds = getValidTargets(state, playerId, sourceCard, effect);
          return selectedIds.reduce((nextState, selectedId) => {
            const owner = nextState.players.find((player) =>
              player.id === selectedId ||
              player.board.some((card) => card?.instanceId === selectedId),
            );
            if (!owner) return nextState;
            const isPlayerTarget = owner.id === selectedId;
            return applyEffect(
              nextState,
              playerId,
              sourceCard,
              {
                ...effect,
                target: isPlayerTarget
                  ? {
                      ...target,
                      zone: 'PLAYER',
                      zones: undefined,
                      owner: owner.id === playerId ? 'SELF' : 'ENEMY',
                      selection: 'SELF',
                      count: 1,
                    }
                  : {
                      ...target,
                      zone: 'BOARD',
                      zones: undefined,
                      owner: owner.id === playerId ? 'SELF' : 'ENEMY',
                      selection: 'PLAYER_CHOICE',
                      count: 1,
                    },
              },
              isPlayerTarget ? undefined : [selectedId],
              triggerContext,
            );
          }, state);
        }
        return state.players.reduce(
          (nextState, owner) =>
            applyEffect(
              nextState,
              playerId,
              sourceCard,
              {
                ...effect,
                target: {
                  ...target,
                  owner: owner.id === playerId ? 'SELF' : 'ENEMY',
                },
              },
              undefined,
              triggerContext,
            ),
          state,
        );
      }
    }
    const targetOwner = target.owner === 'SELF' ? playerId : state.players.find((player) => player.id !== playerId)?.id;
    if (!targetOwner) return state;
    const candidatePlayer = state.players.find((player) => player.id === targetOwner);
    if (!candidatePlayer) return state;
    if (zones.length === 1 && zones[0] === 'CHARACTER') {
      const validIds = getValidTargets(state, playerId, sourceCard, effect);
      const selectedIds = target.selection === 'ALL'
        ? validIds
        : chosenTargetInstanceIds?.filter((id) => validIds.includes(id)) ?? [];
      const playerIds = selectedIds.filter((id) => state.players.some((player) => player.id === id));
      const cardIds = selectedIds.filter((id) => !playerIds.includes(id));
      const afterPlayers = playerIds.reduce((nextState, owner) =>
        applyEffect(nextState, playerId, sourceCard, {
          ...effect,
          target: { ...target, zone: 'PLAYER', zones: undefined, owner: owner === playerId ? 'SELF' : 'ENEMY', selection: 'SELF', count: 1 },
        }, undefined, triggerContext), state);
      return cardIds.reduce((nextState, cardId) => {
        const owner = nextState.players.find((player) =>
          player.board.some((card) => card?.instanceId === cardId))?.id;
        if (!owner) return nextState;
        // A deployed champion is represented by its player id as well as a board
        // token; resolving both must not damage or heal it twice.
        const current = nextState.players.find((player) => player.id === owner)?.board
          .find((card) => card?.instanceId === cardId);
        if (current?.isDirectDeployedChampion && playerIds.includes(owner)) return nextState;
        return applyEffect(nextState, playerId, sourceCard, {
          ...effect,
          target: { ...target, zone: 'BOARD', zones: undefined, owner: owner === playerId ? 'SELF' : 'ENEMY', cardType: 'WRESTLER', selection: 'PLAYER_CHOICE', count: 1 },
        }, [cardId], triggerContext);
      }, afterPlayers);
    }
    if (zones.length === 1 && zones[0] === 'PLAYER' && effect.action === 'HEAL') {
      const directChampion = candidatePlayer.board.find((card) => card?.isDirectDeployedChampion);
      return {
        ...state,
        players: state.players.map((player) => player.id !== targetOwner ? player : directChampion
          ? {
              ...player,
              board: player.board.map((card) => card?.instanceId === directChampion.instanceId
                ? { ...card, currentHealth: Math.min(card.maxHealth, card.currentHealth + amount) }
                : card) as typeof player.board,
            }
          : {
              ...player,
              health: Math.min(player.maxHealth, player.health + amount),
              champion: player.champion ? { ...player.champion, health: Math.min(player.maxHealth, player.health + amount) } : null,
            }),
      };
    }
    if (zones.length === 1 && zones[0] === 'PLAYER') {
      if (isChampionProtectedByToken(state, targetOwner)) return state;
      if (target.owner === 'SELF' && effect.action === 'HEAL') return state;
      if (target.owner === 'SELF' && effect.action === 'DAMAGE') {
        const directChampion = candidatePlayer.board.find((card) => card?.isDirectDeployedChampion);
        const health = directChampion
          ? directChampion.currentHealth - amount
          : candidatePlayer.health - amount;
        const defeated = health <= 0;
        const winner = state.players.find((player) => player.id !== targetOwner);
        return {
          ...state,
          status: defeated ? 'FINISHED' : state.status,
          activePlayerId: defeated ? null : state.activePlayerId,
          winnerId: defeated ? winner?.id ?? null : state.winnerId,
          loserId: defeated ? targetOwner : state.loserId,
          players: state.players.map((player) => player.id !== targetOwner ? player : directChampion
            ? {
                ...player,
                board: player.board.map((card) => card?.instanceId === directChampion.instanceId
                  ? defeated ? null : { ...card, currentHealth: health }
                  : card) as typeof player.board,
                graveyard: defeated ? [...player.graveyard, resetCardForGraveyard(directChampion)] : player.graveyard,
              }
            : {
                ...player,
                health,
                champion: player.champion ? { ...player.champion, health } : null,
              }),
        };
      }
      return target.owner === 'ENEMY'
        ? applyEffect(state, playerId, sourceCard, { type: 'DAMAGE_OPPONENT_CHAMPION', amount: damageAmount }, undefined, triggerContext)
        : state;
    }
    const candidates = cardsInZones(candidatePlayer, zones);
    const eligibleCandidates = candidates.filter((card) => {
      if (card.isDirectDeployedChampion && (
        effect.action === 'SILENCE' ||
        effect.action === 'DESTROY' ||
        effect.action === 'REMOVE_FROM_GAME'
      )) return false;
      if (target.cardType && card.cardType !== target.cardType) return false;
      if (target.filter?.isGenerated !== undefined && card.isGenerated !== target.filter.isGenerated) return false;
      if (target.filter?.minCost !== undefined && card.currentCost < target.filter.minCost) return false;
      if (target.filter?.maxCost !== undefined && card.currentCost > target.filter.maxCost) return false;
      if (target.filter?.isToken !== undefined && card.isToken !== target.filter.isToken) return false;
      if (target.filter?.isChampionToken !== undefined && card.isChampionToken !== target.filter.isChampionToken) return false;
      if (target.filter?.excludeSource && card.instanceId === sourceCard.instanceId) return false;
      if (target.filter?.isVanilla && !isVanillaCard(card)) return false;
      if (target.filter?.keyword !== undefined && !getActiveCardKeywords(card).includes(target.filter.keyword)) return false;
      if (target.filter?.cost && !scriptCompare(card.currentCost, target.filter.cost.compare, target.filter.cost.value)) return false;
      if (target.filter?.attack && !scriptCompare(card.currentAttack, target.filter.attack.compare, target.filter.attack.value)) return false;
      if (target.filter?.health && !scriptCompare(card.currentHealth, target.filter.health.compare, target.filter.health.value)) return false;
       if (!matchesCardTagFilter(card, target.filter)) return false;
      return true;
    });
    const scopedCandidates = sortAndTakeTargetCards(eligibleCandidates, target);
    const randomCandidates = scopedCandidates.filter((card) =>
      target.selection !== 'RANDOM' || isEligibleForRandomPool(card, target.randomScope),
    );
    const targets = target.selection === 'SELF'
      ? scopedCandidates.filter((card) => card.instanceId === sourceCard.instanceId)
      : target.selection === 'PLAYER_CHOICE'
        ? scopedCandidates.filter((card) => chosenTargetInstanceIds?.includes(card.instanceId)).slice(0, Math.max(0, target.count))
        : target.selection === 'SAME_TARGET'
          ? scopedCandidates.filter((card) => chosenTargetInstanceIds?.includes(card.instanceId)).slice(0, Math.max(0, target.count))
        : target.selection === 'ADJACENT'
          ? scopedCandidates.filter((card) =>
            sourceCard.boardSlot !== null &&
            card.boardSlot !== null &&
            getAdjacentSlots(sourceCard.boardSlot).includes(card.boardSlot),
          ).slice(0, Math.max(0, target.count))
        : target.selection === 'TOP'
          ? scopedCandidates.slice(0, Math.max(0, target.count))
        : target.selection === 'ALL'
          ? scopedCandidates
          : shuffle(
              randomCandidates,
              randomForEffect(state, sourceCard, effect),
            ).slice(0, Math.max(0, target.count));
    if (effect.action === 'GRANT_RANDOM_CARD_TEXT') {
      return grantRandomCardText(state, playerId, sourceCard, targets, effect);
    }
    if (effect.action === 'COPY_BEST_STATS') {
      const best = [...targets].sort((left, right) =>
        (right.currentAttack + right.currentHealth) - (left.currentAttack + left.currentHealth) ||
        left.instanceId.localeCompare(right.instanceId),
      )[0];
      return best
        ? applyEffect(state, playerId, sourceCard, {
            type: 'STRUCTURED',
            action: 'BUFF',
            target: { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
            values: { attack: best.currentAttack, health: best.currentHealth },
          }, undefined, triggerContext)
        : state;
    }
    if (!targets.length) {
      return effect.action === 'DESTROY'
        ? withLastAggregatedStats(state, { attack: 0, health: 0 })
        : effect.action === 'ADD_AGGREGATED_ATTACK'
          ? clearLastAggregatedStats(state)
          : state;
    }
    const ids = new Set(targets.map((card) => card.instanceId));
    if (effect.action === 'REVIVE') {
      const revivedState = targets.reduce((nextState, targetCard) => {
        const owner = nextState.players.find((player) => player.id === targetOwner);
        const current = owner?.graveyard.find((card) => card.instanceId === targetCard.instanceId);
        const slot = owner?.board.findIndex((card) => card === null) ?? -1;
        if (!owner || !current || slot < 0) return nextState;

        const revived: CardInstance = {
          ...resetCardForGraveyard(current),
          currentHealth: Math.max(1, current.baseHealth ?? current.maxHealth),
          maxHealth: Math.max(1, current.baseHealth ?? current.maxHealth),
          boardSlot: null,
          enteredThisTurn: false,
          attacksUsedThisTurn: 0,
          isStunned: false,
          activeUsedThisTurn: false,
        };
        const removedFromGraveyard: GameState = {
          ...nextState,
          players: nextState.players.map((player) => player.id !== targetOwner
            ? player
            : { ...player, graveyard: player.graveyard.filter((card) => card.instanceId !== current.instanceId) }),
        };
        return enterField(
          removedFromGraveyard,
          targetOwner,
          revived,
          slot as 0 | 1 | 2 | 3,
          { type: 'CARD', cardInstanceId: sourceCard.instanceId },
          undefined,
          'REVIVE',
        );
      }, state);
      const ownerAfterRevive = revivedState.players.find((player) => player.id === targetOwner);
      const revivedIds = targets
        .map((targetCard) => targetCard.instanceId)
        .filter((instanceId) =>
          ownerAfterRevive?.board.some((card) => card?.instanceId === instanceId) &&
          !ownerAfterRevive.graveyard.some((card) => card.instanceId === instanceId),
        );
      return setLastTargetIds(revivedState, revivedIds);
    }
    if (effect.action === 'MILL') {
      return {
        ...state,
        players: state.players.map((player) => player.id !== targetOwner ? player : {
          ...player,
          deck: player.deck.filter((card) => !ids.has(card.instanceId)),
           graveyard: [...player.graveyard, ...player.deck.filter((card) => ids.has(card.instanceId)).map(resetCardForGraveyard)],
        }),
      };
    }
    if (effect.action === 'MOVE_TO_HAND') {
      const moved = zones.includes('BOARD')
        ? candidatePlayer.board.filter((card): card is CardInstance => card !== null && ids.has(card.instanceId))
        : zones.includes('DECK')
          ? candidatePlayer.deck.filter((card) => ids.has(card.instanceId))
          : candidatePlayer.graveyard.filter((card) => ids.has(card.instanceId));
      if (!moved.length) return state;
      const temporaryCost = effect.values?.temporaryCost
        ? { currentCost: Math.max(effect.values.minimum ?? 0, (moved[0].baseCost ?? moved[0].currentCost) - (effect.values?.amount ?? 1)), temporaryCostUntilTurn: state.turn }
        : {};
      return {
        ...state,
        players: state.players.map((player) => player.id !== targetOwner ? player : {
          ...player,
          board: zones.includes('BOARD')
            ? player.board.map((card) => card && ids.has(card.instanceId) ? null : card) as typeof player.board
            : player.board,
          deck: zones.includes('DECK') ? player.deck.filter((card) => !ids.has(card.instanceId)) : player.deck,
          graveyard: zones.includes('GRAVEYARD') ? player.graveyard.filter((card) => !ids.has(card.instanceId)) : player.graveyard,
            hand: [...player.hand, ...moved.map((card) => normalizeCardForZone({
              ...(zones.includes('GRAVEYARD') ? resetCardForGraveyard(card) : { ...card, boardSlot: null }),
              ...temporaryCost,
            }, 'HAND'))],
        }),
      };
    }
    if (effect.action === 'MOVE_TO_DECK') {
      const moved = [
        ...(zones.includes('BOARD')
          ? candidatePlayer.board.flatMap((card) => card && ids.has(card.instanceId) ? [{ card, zone: 'BOARD' as const }] : [])
          : []),
        ...(zones.includes('HAND')
          ? candidatePlayer.hand.filter((card) => ids.has(card.instanceId)).map((card) => ({ card, zone: 'HAND' as const }))
          : []),
        ...(zones.includes('DECK')
          ? candidatePlayer.deck.filter((card) => ids.has(card.instanceId)).map((card) => ({ card, zone: 'DECK' as const }))
          : []),
        ...(zones.includes('GRAVEYARD')
          ? candidatePlayer.graveyard.filter((card) => ids.has(card.instanceId)).map((card) => ({ card, zone: 'GRAVEYARD' as const }))
          : []),
      ];
      if (!moved.length) return state;
      const normalized = moved.map(({ card, zone }) => normalizeCardForZone(
        zone === 'GRAVEYARD' ? resetCardForGraveyard(card) : { ...card, boardSlot: null },
        'DECK',
      ));
      return {
        ...state,
        players: state.players.map((player) => player.id !== targetOwner ? player : {
          ...player,
          board: zones.includes('BOARD')
            ? player.board.map((card) => card && ids.has(card.instanceId) ? null : card) as typeof player.board
            : player.board,
          hand: zones.includes('HAND') ? player.hand.filter((card) => !ids.has(card.instanceId)) : player.hand,
          graveyard: zones.includes('GRAVEYARD') ? player.graveyard.filter((card) => !ids.has(card.instanceId)) : player.graveyard,
          deck: [
            ...(effect.values?.deckPosition === 'TOP' ? normalized : []),
            ...(zones.includes('DECK') ? player.deck.filter((card) => !ids.has(card.instanceId)) : player.deck),
            ...(effect.values?.deckPosition === 'TOP' ? [] : normalized),
          ],
        }),
      };
    }
    if (effect.action === 'STEAL') {
      const sourcePlayer = state.players.find((player) => player.id === targetOwner);
      const destinationPlayer = state.players.find((player) => player.id === playerId);
      if (!sourcePlayer || !destinationPlayer) return state;
       const stolen = cardsInZones(sourcePlayer, zones).filter((card) => ids.has(card.instanceId));
      if (!stolen.length || destinationPlayer.hand.length >= 7) return state;
      return {
        ...state,
        players: state.players.map((player) => player.id === targetOwner
           ? {
             ...player,
             deck: zones.includes('DECK') ? player.deck.filter((card) => !ids.has(card.instanceId)) : player.deck,
             hand: zones.includes('HAND') ? player.hand.filter((card) => !ids.has(card.instanceId)) : player.hand,
             graveyard: zones.includes('GRAVEYARD') ? player.graveyard.filter((card) => !ids.has(card.instanceId)) : player.graveyard,
             board: zones.includes('BOARD')
               ? player.board.map((card) => card && ids.has(card.instanceId) ? null : card) as typeof player.board
               : player.board,
           }
          : player.id === playerId
              ? { ...player, hand: [...player.hand, ...stolen.map((card) => normalizeCardForZone(
                zones.includes('GRAVEYARD') ? resetCardForGraveyard(card) : { ...card, boardSlot: null },
                'HAND',
              ))] }
            : player),
      };
    }
    if (effect.action === 'RETIRE') {
      return targets.reduce((nextState, targetCard) => {
        const owner = nextState.players.find((player) => player.id === targetOwner);
        const current = owner?.board.find((card) => card?.instanceId === targetCard.instanceId);
        if (!owner || !current || current.isDirectDeployedChampion) return nextState;
        const attribution = sourceContextFor(playerId, sourceCard, triggerContext);
        const retiredState: GameState = {
          ...nextState,
          players: nextState.players.map((player) => player.id !== targetOwner ? player : {
            ...player,
            board: player.board.map((card) => card?.instanceId === current.instanceId ? null : card) as typeof player.board,
             graveyard: [...player.graveyard, resetCardForGraveyard(current)],
          }),
          events: [...nextState.events, {
            type: 'CARD_RETIRED' as const, playerId: targetOwner, cardInstanceId: current.instanceId, cardType: current.cardType,
            boardSlot: current.boardSlot!, source: { type: 'CARD' as const, cardInstanceId: sourceCard.instanceId },
             target: { type: 'CARD' as const, cardInstanceId: current.instanceId }, reason: 'RETIRE' as const,
             sourceContext: attribution,
          }],
        };
        const withSnapshot = effect.values?.captureStats
          ? withLastAggregatedStats(retiredState, {
            attack: current.currentAttack,
            health: current.currentHealth,
          })
          : retiredState;
        const selfRetired = resolveTriggeredAbilities(withSnapshot, targetOwner, current, 'SELF_RETIRE', {
          leaveReason: 'RETIRE',
          sourceContext: attribution,
        });
        const legacyLeave = resolveTriggeredAbilities(
          selfRetired !== withSnapshot && selfRetired.targetingState?.active
            ? resolvePendingEffects(selfRetired)
            : selfRetired,
          targetOwner,
          current,
          'LEAVE_FIELD',
          {
            leaveReason: 'RETIRE',
            sourceContext: attribution,
          },
        );
        const retiredListenersState = resolveCardRetiredListeners(
          legacyLeave,
          targetOwner,
          current,
          attribution,
        );
        return effect.values?.captureStats
          ? withLastAggregatedStats(retiredListenersState, {
            attack: current.currentAttack,
            health: Math.max(0, current.currentHealth),
          })
          : retiredListenersState;
      }, state);
    }
    if (effect.action === 'DESTROY') {
      const aggregatedStats = targets.reduce(
        (stats, target) => ({
          attack: stats.attack + target.currentAttack,
          health: stats.health + target.currentHealth,
        }),
        { attack: 0, health: 0 },
      );
      const destroyedState = targets.reduce((nextState, target) => {
        const result = destroyCard(nextState, targetOwner, target.instanceId);
        return result.success ? result.state : nextState;
      }, state);
      return withLastAggregatedStats(destroyedState, aggregatedStats);
    }
    if (effect.action === 'REMOVE_FROM_GAME') {
      return targets.reduce((nextState, target) => {
        const owner = nextState.players.find((player) => player.id === targetOwner);
        const current = owner?.board.find((card) => card?.instanceId === target.instanceId);
        if (!owner || !current || current.isDirectDeployedChampion) return nextState;
        return {
          ...nextState,
          players: nextState.players.map((player) => player.id !== targetOwner ? player : {
            ...player,
            board: player.board.map((card) => card?.instanceId === current.instanceId ? null : card) as typeof player.board,
            removedFromGame: [...player.removedFromGame, { ...current, boardSlot: null }],
          }),
          events: [...nextState.events, {
            type: 'CARD_REMOVED', playerId: targetOwner, cardInstanceId: current.instanceId,
            source: { type: 'CARD', cardInstanceId: sourceCard.instanceId },
            target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'REMOVE_FROM_GAME',
          }],
        };
      }, state);
    }
    if (effect.action === 'CAPTURE') {
      return targets.reduce((nextState, target) => {
        const owner = nextState.players.find((player) => player.id === targetOwner);
        const current = owner?.board.find((card) => card?.instanceId === target.instanceId);
        if (!owner || !current || current.isDirectDeployedChampion) return nextState;
        const snapshot = {
          definitionId: current.definitionId, cardType: current.cardType,
          currentCost: current.baseCost ?? current.currentCost,
          currentAttack: current.baseAttack ?? current.currentAttack,
          currentHealth: current.baseHealth ?? current.maxHealth,
          maxHealth: current.baseHealth ?? current.maxHealth,
          isGenerated: current.isGenerated, isToken: current.isToken, isChampionToken: current.isChampionToken,
           keywords: [...current.keywords], abilities: [...current.abilities], tags: current.tags ? [...current.tags] : [],
           grantedText: current.grantedText ? structuredClone(current.grantedText) : undefined,
        };
        return {
          ...nextState,
          players: nextState.players.map((player) => {
            if (player.id === targetOwner) return { ...player, board: player.board.map((card) => card?.instanceId === current.instanceId ? null : card) as typeof player.board };
            if (player.id === playerId) return { ...player, board: player.board.map((card) => card?.instanceId === sourceCard.instanceId ? { ...card, capturedCards: [...(card.capturedCards ?? []), { definitionId: current.definitionId, baseSnapshot: snapshot }] } : card) as typeof player.board };
            return player;
          }),
        };
      }, state);
    }
    if (effect.action === 'DAMAGE') {
      return targets.reduce((nextState, target) => {
        const owner = nextState.players.find((player) => player.id === targetOwner);
        const current = owner?.board.find((card) => card?.instanceId === target.instanceId);
        if (!owner || !current) return nextState;
        const beforeDamage = resolveTriggeredAbilities(nextState, targetOwner, current, 'BEFORE_DAMAGE');
        const preparedState = beforeDamage !== nextState && beforeDamage.targetingState?.active
          ? resolvePendingEffects(beforeDamage)
          : beforeDamage;
        const preparedCurrent = preparedState.players
          .find((player) => player.id === targetOwner)
          ?.board.find((card) => card?.instanceId === target.instanceId) ?? current;
        const preventedDamage = preparedState.preventedDamageTargetIds?.includes(current.instanceId) ?? false;
        const clearDamageMarker = (stateWithMarker: GameState): GameState => ({
          ...stateWithMarker,
          preventedDamageTargetIds: stateWithMarker.preventedDamageTargetIds?.filter((id) => id !== current.instanceId),
        });
        if (preventedDamage) {
          return resolveRegisteredRuleListeners({
            ...clearDamageMarker(preparedState),
            events: [
              ...preparedState.events,
              { type: 'DAMAGE_DEALT', playerId, cardInstanceId: sourceCard.instanceId, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'CARD_EFFECT', amount: 0, sourceContext: sourceContextFor(playerId, sourceCard, triggerContext) },
            ],
          }, 'DAMAGE_TAKEN', targetOwner, current.instanceId, current.cardType);
        }
        // Legacy snapshots may carry dodgeAvailable=true with a missing or
        // zero-initialized charge count. The boolean remains authoritative for
        // that compatibility case; newly created cards keep both fields aligned.
        const dodgeCharges = Math.max(
          preparedCurrent.dodgeCharges ?? 0,
          preparedCurrent.dodgeAvailable ? 1 : 0,
        );
        const dodged = damageAmount > 0 && dodgeCharges > 0 && hasKeyword(preparedCurrent, 'DODGE');
        if (dodged) {
          return resolveRegisteredRuleListeners({
            ...clearDamageMarker(preparedState),
            players: preparedState.players.map((player) => player.id === targetOwner
              ? { ...player, board: player.board.map((card) => card?.instanceId === current.instanceId ? { ...card, dodgeAvailable: dodgeCharges > 1, dodgeCharges: dodgeCharges - 1 } : card) as typeof player.board }
              : player),
            events: [...preparedState.events, { type: 'DAMAGE_DEALT', playerId, cardInstanceId: sourceCard.instanceId, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'CARD_EFFECT', amount: 0, sourceContext: sourceContextFor(playerId, sourceCard, triggerContext) }],
          }, 'DAMAGE_TAKEN', targetOwner, current.instanceId, current.cardType);
        }
        const health = preparedCurrent.currentHealth - damageAmount;
        if (health > 0) {
          const damagedState: GameState = {
            ...clearDamageMarker(preparedState),
            players: preparedState.players.map((player) => player.id === targetOwner
              ? { ...player, board: player.board.map((card) => card?.instanceId === current.instanceId ? { ...card, currentHealth: health } : card) as typeof player.board }
              : player),
            events: [...preparedState.events, { type: 'DAMAGE_DEALT', playerId, cardInstanceId: sourceCard.instanceId, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'CARD_EFFECT', amount: damageAmount, sourceContext: sourceContextFor(playerId, sourceCard, triggerContext) }],
          };
          const damagedCard = damagedState.players.find((player) => player.id === targetOwner)?.board
            .find((card) => card?.instanceId === current.instanceId) ?? current;
          const selfDamaged = resolveTriggeredAbilities(
            damagedState,
            targetOwner,
            damagedCard,
            'SELF_DAMAGED',
            { healthBefore: preparedCurrent.currentHealth, healthAfter: health, sourceContext: sourceContextFor(playerId, sourceCard, triggerContext) },
          );
          const withDamageListeners = resolveRegisteredRuleListeners(
            selfDamaged !== damagedState && selfDamaged.targetingState?.active
              ? resolvePendingEffects(selfDamaged)
              : selfDamaged,
            'DAMAGE_TAKEN',
            targetOwner,
            current.instanceId,
            current.cardType,
          );
          const conditional = effect.values?.conditionalBuff;
          return conditional && health === conditional.healthEquals
            ? applyEffect(withDamageListeners, playerId, sourceCard, {
              type: 'STRUCTURED',
              action: 'BUFF',
              target: { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
              values: { attack: conditional.attack, health: conditional.health },
            }, undefined, triggerContext)
            : withDamageListeners;
        }
        const lethalDamagedState = {
          ...clearDamageMarker(preparedState),
          players: preparedState.players.map((player) => player.id === targetOwner
            ? { ...player, board: player.board.map((card) => card?.instanceId === current.instanceId ? { ...card, currentHealth: health } : card) as typeof player.board }
            : player),
        };
        const selfDamaged = resolveTriggeredAbilities(
          lethalDamagedState,
          targetOwner,
          { ...preparedCurrent, currentHealth: health },
          'SELF_DAMAGED',
          { healthBefore: preparedCurrent.currentHealth, healthAfter: health, sourceContext: sourceContextFor(playerId, sourceCard, triggerContext) },
        );
        const afterSelfDamaged = selfDamaged !== lethalDamagedState && selfDamaged.targetingState?.active
          ? resolvePendingEffects(selfDamaged)
          : selfDamaged;
        const liveCurrent = afterSelfDamaged.players.find((player) => player.id === targetOwner)?.board
          .find((card) => card?.instanceId === current.instanceId) ?? preparedCurrent;
        const beforeRetire = resolveTriggeredAbilities(afterSelfDamaged, targetOwner, liveCurrent, 'BEFORE_RETIRE');
        const protectedState = beforeRetire !== afterSelfDamaged && beforeRetire.targetingState?.active
          ? resolvePendingEffects(beforeRetire)
          : beforeRetire;
        if (protectedState.preventedRetireTargetIds?.includes(current.instanceId)) {
          return resolveRegisteredRuleListeners({
            ...protectedState,
            preventedRetireTargetIds: protectedState.preventedRetireTargetIds.filter((id) => id !== current.instanceId),
            events: [...protectedState.events, { type: 'DAMAGE_DEALT', playerId, cardInstanceId: sourceCard.instanceId, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'CARD_EFFECT', amount: 0, sourceContext: sourceContextFor(playerId, sourceCard, triggerContext) }],
          }, 'DAMAGE_TAKEN', targetOwner, current.instanceId, current.cardType);
        }
         const retired: CardInstance = resetCardForGraveyard({
           ...preparedCurrent,
           currentHealth: health,
           boardSlot: null,
         });
        const retiredState: GameState = {
          ...clearDamageMarker(protectedState),
          players: protectedState.players.map((player) => player.id === targetOwner
             ? { ...player, board: player.board.map((card) => card?.instanceId === current.instanceId ? null : card) as typeof player.board, graveyard: [...player.graveyard, retired] }
            : player),
          events: [...protectedState.events,
            { type: 'DAMAGE_DEALT', playerId, cardInstanceId: sourceCard.instanceId, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'CARD_EFFECT', amount: damageAmount, sourceContext: sourceContextFor(playerId, sourceCard, triggerContext) },
            { type: 'CARD_RETIRED', playerId: targetOwner, cardInstanceId: current.instanceId, cardType: current.cardType, boardSlot: current.boardSlot!, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, targetSnapshot: { playerId: targetOwner, cardInstanceId: current.instanceId, cardType: current.cardType ?? 'WRESTLER', boardSlot: current.boardSlot!, currentAttack: current.currentAttack, currentHealth: current.currentHealth }, reason: 'RETIRE', sourceContext: sourceContextFor(playerId, sourceCard, triggerContext) },
          ],
        };
        const retiredWithAggregate = withLastAggregatedStats(retiredState, {
          attack: current.currentAttack,
          health: Math.max(0, current.currentHealth),
        });
        const exactZeroState = health === 0
          ? resolveTriggeredAbilities(retiredWithAggregate, playerId, sourceCard, 'EXACT_ZERO_DAMAGE', {
            damagedTargetInstanceId: current.instanceId, healthBefore: current.currentHealth, healthAfter: health,
          })
          : retiredWithAggregate;
        const attribution = sourceContextFor(playerId, sourceCard, triggerContext);
        const selfRetired = resolveTriggeredAbilities(exactZeroState, targetOwner, current, 'SELF_RETIRE', {
          leaveReason: 'RETIRE',
          sourceContext: attribution,
        });
        const legacyLeave = selfRetired !== exactZeroState && selfRetired.targetingState?.active
          ? resolvePendingEffects(selfRetired)
          : selfRetired;
        const retiredListenersState = resolveCardRetiredListeners(
          resolveTriggeredAbilities(legacyLeave, targetOwner, current, 'LEAVE_FIELD', {
            leaveReason: 'RETIRE',
            sourceContext: attribution,
          }),
          targetOwner,
          current,
          attribution,
        );
        const resumed = withLastAggregatedStats(retiredListenersState, {
          attack: current.currentAttack,
          health: Math.max(0, current.currentHealth),
        });
        const continuation = resumed.targetingState ?? state.targetingState;
        return continuation ? resolvePendingEffects({ ...resumed, targetingState: continuation }) : resumed;
      }, state);
    }
    if (effect.action === 'SILENCE') {
      return [...ids].reduce((nextState, id) => silenceCard(nextState, id), state);
    }
    if (effect.action === 'ADD_AGGREGATED_ATTACK') {
      const aggregate = state.lastAggregatedStats ?? state.targetingState?.lastAggregatedStats ?? lastRetiredSnapshot(state);
      if (!aggregate) return clearLastAggregatedStats(state);
      const withoutAggregate = clearLastAggregatedStats(state);
      const aggregateTargets = ids.size ? ids : new Set([sourceCard.instanceId]);
      return {
        ...withoutAggregate,
        players: withoutAggregate.players.map((player) => player.id !== targetOwner
          ? player
          : {
              ...player,
              board: player.board.map((card) => card && aggregateTargets.has(card.instanceId)
                ? { ...card, currentAttack: card.currentAttack + aggregate.attack }
                : card) as typeof player.board,
            }),
      };
    }
    const updatedState: GameState = {
      ...state,
      players: state.players.map((player) => {
            const update = (card: CardInstance, zone: 'HAND' | 'DECK' | 'BOARD'): CardInstance => {
          if (!ids.has(card.instanceId)) return card;
              const finish = (next: CardInstance, duration = effect.values?.duration) =>
                recordStatChanges(
                  card,
                  normalizeCardForZone(
                    withTemporaryStatDeltas(card, next, state.turn, duration),
                    zone,
                  ),
                  state,
                  sourceCard,
                  triggerContext,
                  duration,
                );
           if (effect.action === 'SILENCE') return card; // resolved centrally below
             if (effect.action === 'ADD_KEYWORD' && effect.values?.keyword) {
               if (effect.values.keyword === 'DODGE' && getActiveCardKeywords(card).includes('DODGE')) {
                 const charges = Math.max(0, card.dodgeCharges ?? (card.dodgeAvailable ? 1 : 0)) + 1;
                 return { ...card, dodgeAvailable: true, dodgeCharges: charges };
               }
               if (!getActiveCardKeywords(card).includes(effect.values.keyword)) {
                 return { ...card, keywords: [...card.keywords, effect.values.keyword], dodgeAvailable: effect.values.keyword === 'DODGE' ? true : card.dodgeAvailable, dodgeCharges: effect.values.keyword === 'DODGE' ? Math.max(1, card.dodgeCharges ?? 0) : card.dodgeCharges };
               }
             }
            if (effect.action === 'REMOVE_KEYWORD' && effect.values?.keyword) return { ...card, keywords: card.keywords.filter((keyword) => keyword !== effect.values?.keyword), dodgeAvailable: effect.values.keyword === 'DODGE' ? false : card.dodgeAvailable, dodgeCharges: effect.values.keyword === 'DODGE' ? 0 : card.dodgeCharges };
           if (effect.action === 'STUN') return { ...card, isStunned: true };
             if (effect.action === 'REDUCE_COST') return finish({ ...card, currentCost: Math.max(effect.values?.minimum ?? 0, card.currentCost - amount) });
            if (effect.action === 'INCREASE_COST') return finish({ ...card, currentCost: card.currentCost + amount });
             if (effect.action === 'MODIFY_STAT' && effect.values?.stat) {
               const signedAmount = effect.values.amount ?? 0;
               if (effect.values.stat === 'COST') {
                 return finish({ ...card, currentCost: Math.max(effect.values.minimum ?? 0, card.currentCost + signedAmount) });
               }
               if (effect.values.stat === 'ATTACK') {
                 return finish({ ...card, currentAttack: card.currentAttack + signedAmount });
               }
               return finish({
                 ...card,
                 currentHealth: card.currentHealth + signedAmount,
                 maxHealth: Math.max(1, card.maxHealth + signedAmount),
               });
             }
             if (effect.action === 'MODIFY_MAX_HEALTH') {
               const signedAmount = effect.values?.amount ?? 0;
               return finish({
                 ...card,
                 maxHealth: Math.max(1, card.maxHealth + signedAmount),
               });
             }
             if (effect.action === 'SET_STAT' && effect.values?.stat && effect.values.amount !== undefined) {
               if (effect.values.stat === 'COST') return finish({ ...card, currentCost: Math.max(0, effect.values.amount) });
               if (effect.values.stat === 'ATTACK') return finish({ ...card, currentAttack: effect.values.amount });
               return finish({
                 ...card,
                 currentHealth: effect.values.amount,
                 maxHealth: Math.max(1, effect.values.amount),
               });
             }
            if (effect.action === 'HEAL') return finish({ ...card, currentHealth: Math.min(card.maxHealth, card.currentHealth + amount) });
            if (effect.action === 'DISABLE_ABILITY') return { ...card, isAbilityDisabled: true };
            if (effect.action === 'WEAKEN_TO_STUN_SILENCE') {
              const attack = Math.max(0, card.currentAttack - amount);
              return finish(attack === 0 ? { ...card, currentAttack: attack, isStunned: true, isSilenced: true } : { ...card, currentAttack: attack });
            }
            if (effect.action === 'BUFF') {
            const health = effect.values?.health ?? 0;
              const dynamic = dynamicValue(state, playerId, effect.values?.amountReference, triggerContext);
             const attackMultiplier = effect.values?.attackMultiplier ?? 1;
             const healthMultiplier = effect.values?.healthMultiplier ?? 1;
              return finish({
               ...card,
                currentAttack: card.currentAttack * attackMultiplier + (effect.values?.attack ?? (effect.values?.amountReference ? dynamic : 0)) + referenceAmount,
                maxHealth: card.maxHealth * healthMultiplier + (effect.values?.health ?? (effect.values?.amountReference ? dynamic : 0)),
                currentHealth: card.currentHealth * healthMultiplier + health + (effect.values?.health === undefined && effect.values?.amountReference ? dynamic : 0),
               }, effect.values?.duration);
          }
           if (effect.action === 'SET_STATS') {
              return finish({
               ...card,
               ...(effect.values?.attack !== undefined ? { currentAttack: effect.values.attack } : {}),
               ...(effect.values?.health !== undefined ? {
                 currentHealth: effect.values.health,
                 maxHealth: Math.max(card.maxHealth, effect.values.health),
               } : {}),
               }, effect.values?.duration);
           }
           if (effect.action === 'SWAP_STATS') {
              return finish({
               ...card,
               currentAttack: card.currentHealth,
               currentHealth: card.currentAttack,
              });
           }
          return card;
        };
        if (player.id !== targetOwner) return player;
          const updatedDeck = zones.includes('DECK') ? player.deck.map((card) => update(card, 'DECK')) : player.deck;
          const updatedHand = zones.includes('HAND') ? player.hand.map((card) => update(card, 'HAND')) : player.hand;
         const updatedBoard = zones.includes('BOARD')
            ? player.board.map((card) => card ? update(card, 'BOARD') : null) as typeof player.board
           : player.board;
         return { ...player, deck: updatedDeck, hand: updatedHand, board: updatedBoard };
      }),
    };
    const sourceContext = sourceContextFor(playerId, sourceCard, triggerContext);
    const changes = statChangeEvents(state, updatedState, sourceCard, sourceContext, effect.values?.duration);
    return resolveStatChangeListeners(
      state,
      {
        ...updatedState,
        events: changes.length ? [...updatedState.events, ...changes] : updatedState.events,
      },
      sourceContext,
    );
  }
  if (effect.type === 'GAIN_GOLD') {
     const updatedState: GameState = {
      ...state,
      players: state.players.map((player) =>
        player.id === playerId
          ? { ...player, currentGold: player.currentGold + effect.amount }
          : player,
      ),
      events: [
        ...state.events,
        {
          type: 'GOLD_CHANGED',
          playerId,
          cardInstanceId: sourceCard.instanceId,
          source: {
            type: 'CARD',
            cardInstanceId: sourceCard.instanceId,
          },
          target: { type: 'PLAYER', playerId },
          reason: 'CARD_EFFECT',
          amount: effect.amount,
        },
      ],
     };
     return resolveStatChangeListeners(state, updatedState, sourceContextFor(playerId, sourceCard, triggerContext));
  }

  if (effect.type === 'DAMAGE_OPPONENT_CHAMPION') {
    const opponent = state.players.find((player) => player.id !== playerId);
    if (!opponent) return state;
    if (isChampionProtectedByToken(state, opponent.id)) {
      return {
        ...state,
        events: [
          ...state.events,
          {
            type: 'DAMAGE_DEALT',
            playerId,
            cardInstanceId: sourceCard.instanceId,
            source: { type: 'CARD', cardInstanceId: sourceCard.instanceId },
            target: { type: 'PLAYER', playerId: opponent.id },
            reason: 'CARD_EFFECT',
            amount: 0,
            sourceContext: sourceContextFor(playerId, sourceCard, triggerContext),
          },
        ],
      };
    }

    const directChampion =
      opponent.board.find((card) => card?.isDirectDeployedChampion) ?? null;
    const remainingHealth = directChampion
      ? directChampion.currentHealth - effect.amount
      : opponent.health - effect.amount;
    const defeated = remainingHealth <= 0;

    const damagedState: GameState = {
      ...state,
      status: defeated && !directChampion ? 'FINISHED' : state.status,
      activePlayerId: defeated && !directChampion ? null : state.activePlayerId,
      winnerId: defeated && !directChampion ? playerId : state.winnerId,
      loserId: defeated && !directChampion ? opponent.id : state.loserId,
      players: state.players.map((player) => {
        if (player.id !== opponent.id) return player;

        if (directChampion) {
          const damagedChampion = {
            ...directChampion,
            currentHealth: remainingHealth,
            boardSlot: defeated ? null : directChampion.boardSlot,
          };
          return {
            ...player,
            board: player.board.map((card) =>
              card?.instanceId === directChampion.instanceId
                ? defeated
                  ? null
                  : damagedChampion
                : card,
            ) as typeof player.board,
            graveyard: defeated
               ? [...player.graveyard, resetCardForGraveyard(damagedChampion)]
              : player.graveyard,
          };
        }

        return {
          ...player,
          health: remainingHealth,
          champion: player.champion
            ? { ...player.champion, health: remainingHealth }
            : null,
        };
      }),
      events: [
        ...state.events,
        {
          type: 'DAMAGE_DEALT',
          playerId,
          cardInstanceId: sourceCard.instanceId,
          source: {
            type: 'CARD',
            cardInstanceId: sourceCard.instanceId,
          },
          target: directChampion
            ? { type: 'CARD', cardInstanceId: directChampion.instanceId }
            : { type: 'PLAYER', playerId: opponent.id },
          reason: 'CARD_EFFECT',
          amount: effect.amount,
          sourceContext: sourceContextFor(playerId, sourceCard, triggerContext),
        },
        ...(defeated && directChampion
          ? [
              {
                type: 'CARD_RETIRED' as const,
                playerId: opponent.id,
                cardInstanceId: directChampion.instanceId,
                cardType: directChampion.cardType,
                boardSlot: directChampion.boardSlot!,
                source: {
                  type: 'CARD' as const,
                  cardInstanceId: sourceCard.instanceId,
                },
                target: {
                  type: 'CARD' as const,
                  cardInstanceId: directChampion.instanceId,
                },
                reason: 'RETIRE',
                sourceContext: sourceContextFor(playerId, sourceCard, triggerContext),
              },
            ]
          : []),
      ],
    };
    if (defeated && directChampion) {
      const attribution = sourceContextFor(playerId, sourceCard, triggerContext);
      return resolveCardRetiredListeners(
        resolveTriggeredAbilities(damagedState, opponent.id, directChampion, 'LEAVE_FIELD', {
          leaveReason: 'RETIRE',
          sourceContext: attribution,
        }),
        opponent.id,
        directChampion,
        attribution,
      );
    }
    return damagedState;
  }

  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      board: player.board.map((card) =>
        card?.instanceId === sourceCard.instanceId
          ? {
              ...card,
              currentAttack: card.currentAttack + effect.amount,
            }
          : card,
      ) as typeof player.board,
    })),
  };
}

export function resolveQueuedEffectsForPlayedWrestler(
  state: GameState,
  playerId: string,
  cardInstanceId: string,
): GameState {
  const queued = (state.pendingCardEffects ?? []).filter(
    (pending) => pending.playerId === playerId && pending.trigger === 'NEXT_ALLY_WRESTLER_PLAYED' &&
      pending.sourceInstanceId !== cardInstanceId &&
      (pending.registeredEventIndex === undefined || pending.registeredEventIndex < state.events.length - 1),
  );
  if (!queued.length) return state;

  const consumed = new Set(queued);
  let next = {
    ...state,
    pendingCardEffects: (state.pendingCardEffects ?? []).filter(
      (pending) => !consumed.has(pending),
    ),
  };
  for (const pending of queued) {
    const sourceCard = sourceInState(next, cardInstanceId);
    if (!sourceCard) continue;
    next = applyEffect(
      next,
      playerId,
      sourceCard,
      {
        type: 'STRUCTURED',
        action: pending.effect.action,
        target: pending.effect.target ?? { zone: 'BOARD', owner: 'SELF', cardType: 'WRESTLER', selection: 'SELF', count: 1 },
        values: pending.effect.values,
      },
    );
  }
  return next;
}

export function resolveQueuedEffectsForPlayedTechnique(
  state: GameState,
  playerId: string,
  cardInstanceId: string,
): GameState {
  const queued = (state.pendingCardEffects ?? []).filter(
    (pending) => pending.playerId === playerId && pending.trigger === 'NEXT_TECHNIQUE_PLAYED' &&
      pending.sourceInstanceId !== cardInstanceId &&
      (pending.registeredEventIndex === undefined || pending.registeredEventIndex < state.events.length - 1),
  );
  if (!queued.length) return state;
  const consumed = new Set(queued);
  let next = {
    ...state,
    pendingCardEffects: (state.pendingCardEffects ?? []).filter(
      (pending) => !consumed.has(pending),
    ),
  };
  const sourceCard = sourceInState(next, cardInstanceId);
  if (!sourceCard) return next;
  for (const pending of queued) {
    next = applyEffect(next, playerId, sourceCard, {
      type: 'STRUCTURED',
      action: pending.effect.action,
      target: pending.effect.target ?? { zone: 'HAND', owner: 'SELF', selection: 'SELF', count: 1 },
      values: pending.effect.values,
    });
  }
  return next;
}

export function resolveTriggeredAbilities(
  state: GameState,
  playerId: string,
  card: CardInstance,
  trigger: 'GAME_START' | 'ENTER_FIELD' | 'LEAVE_FIELD' | 'SELF_RETIRE' | 'POSITION' | 'ACTIVE' | 'CARD_DRAWN' | 'CARD_RETIRED' | 'CARD_SUMMONED' | 'CARD_ENTERED' | 'FIRST_ATTACKED' | 'SELF_ATTACK' | 'OTHER_ALLY_ATTACK' | 'ATTACK_SURVIVED' | 'SELF_DAMAGED' | 'STAT_CHANGED' | 'TECHNIQUE_CAST' | 'EXACT_ZERO_DAMAGE' | 'TURN_START' | 'TURN_END' | 'BEFORE_DAMAGE' | 'BEFORE_RETIRE',
  options: {
    boardSlot?: 0 | 1 | 2 | 3;
    leaveReason?: LeaveReason;
    chosenTargetInstanceIds?: string[];
    playedFromHand?: boolean;
    baseCost?: number;
    attackerInstanceId?: string;
    damagedTargetInstanceId?: string;
    attackDelta?: number;
    healthDelta?: number;
    playedCardGenerated?: boolean;
    playedCardType?: CardInstance['cardType'];
    healthBefore?: number;
    healthAfter?: number;
    sourceContext?: EventAttribution;
  } = {},
): GameState {
  if (card.isAbilityDisabled || (card.isSilenced && !card.grantedText)) return state;

  const compare = (actual: number, condition: 'GTE' | 'LTE' | 'EQ', expected: number) =>
    condition === 'GTE' ? actual >= expected : condition === 'LTE' ? actual <= expected : actual === expected;
  const abilities = getActiveCardAbilities(card).filter((ability) => {
    if (ability.trigger !== trigger) return false;
    if ((trigger === 'BEFORE_DAMAGE' || trigger === 'BEFORE_RETIRE') &&
      state.consumedRuleKeys?.includes(`${card.instanceId}:${trigger}`)) return false;
    const condition = 'condition' in ability ? ability.condition : undefined;
    if (condition) {
      const owner = state.players.find((player) => player.id === playerId);
      if (!owner) return false;
      if (condition.type === 'HAND_COUNT' && !compare(owner.hand.length, condition.compare, condition.amount)) return false;
      if (condition.type === 'BOARD_COUNT' && !compare(owner.board.filter(Boolean).length, condition.compare, condition.amount)) return false;
      if (condition.type === 'HAS_TAG' && !owner.hand.some((entry) => entry.tags?.includes(condition.tag))) return false;
      if (condition.type === 'SOURCE_ON_LEFT_SIDE' && (card.boardSlot === null || card.boardSlot > 1)) return false;
      if (condition.type === 'SOURCE_ON_RIGHT_SIDE' && (card.boardSlot === null || card.boardSlot < 2)) return false;
      if (condition.type === 'BASE_COST_GTE' && (options.baseCost ?? 0) < condition.amount) return false;
       if (condition.type === 'FIRST_ATTACK_GAIN' &&
         (card.statHistory ?? []).filter((entry) => entry.stat === 'attack' && entry.delta > 0).length !== 1) return false;
    }
    if (
      ability.trigger === 'POSITION' &&
      (options.boardSlot === undefined ||
        !ability.boardSlots.includes(options.boardSlot))
    ) {
      return false;
    }
    if (
      ability.trigger === 'LEAVE_FIELD' &&
      ability.reasons &&
      (!options.leaveReason ||
        !ability.reasons.includes(options.leaveReason))
    ) {
      return false;
    }
    return true;
  });

  const effects = abilities.flatMap((ability) => ability.effects);
  if (!effects.length) return state;
  return beginResolution(state, {
    active: true, playerId, sourceInstanceId: card.instanceId, sourceCard: card, effects,
     effectIndex: 0, selectedTargetIds: [], lastTargetIds: options.chosenTargetInstanceIds ?? (trigger === 'FIRST_ATTACKED' && options.attackerInstanceId ? [options.attackerInstanceId] : []),
    validTargetIds: [], minTargets: 0, maxTargets: 0, mandatory: true, cancelable: false,
      triggerContext: { playedFromHand: options.playedFromHand, baseCost: options.baseCost, attackerInstanceId: options.attackerInstanceId, damagedTargetInstanceId: options.damagedTargetInstanceId, attackDelta: options.attackDelta, healthDelta: options.healthDelta, healthBefore: options.healthBefore, healthAfter: options.healthAfter, sourceContext: options.sourceContext },
     lastAggregatedStats: state.targetingState?.lastAggregatedStats,
  });
}

/** Dispatches retirement listeners to cards that are still in hand. */
export function resolveCardRetiredListeners(
  state: GameState,
  playerId: string,
  retiredCard: CardInstance,
  sourceContext?: EventAttribution,
): GameState {
  const hand = state.players.find((player) => player.id === playerId)?.hand ?? [];
  const withCardAbilities = hand
    .filter((card) => card.cardType === 'WRESTLER')
    .reduce(
      (next, card) => resolveTriggeredAbilities(next, playerId, card, 'CARD_RETIRED', {
        chosenTargetInstanceIds: [retiredCard.instanceId],
        sourceContext,
      }),
      state,
    );
  return resolveRegisteredRuleListeners(withCardAbilities, 'CARD_RETIRED', playerId, retiredCard.instanceId, retiredCard.cardType);
}

/** Dispatches the generic summon aura trigger to the summoning player's board. */
export function resolveSummonListeners(
  state: GameState,
  playerId: string,
  summonedCard: CardInstance,
  sourceContext?: EventAttribution,
): GameState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return state;
  return player.board
    .filter((card): card is CardInstance => Boolean(card))
    .filter((card) => card.instanceId !== summonedCard.instanceId)
    .reduce(
      (next, card) => resolveTriggeredAbilities(next, playerId, card, 'CARD_SUMMONED', {
        chosenTargetInstanceIds: [summonedCard.instanceId],
        sourceContext,
      }),
      state,
    );
}

/** Dispatches generic ally-entry listeners for any normal field entry cause. */
export function resolveCardEntryListeners(
  state: GameState,
  playerId: string,
  enteredCard: CardInstance,
  sourceContext?: EventAttribution,
): GameState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return state;
  return player.board
    .filter((card): card is CardInstance => Boolean(card))
    .filter((card) => card.instanceId !== enteredCard.instanceId)
    .reduce(
      (next, card) => resolveTriggeredAbilities(next, playerId, card, 'CARD_ENTERED', {
        chosenTargetInstanceIds: [enteredCard.instanceId],
        sourceContext,
      }),
      state,
    );
}

export function resolveActiveAbility(
  state: GameState,
  playerId: string,
  card: CardInstance,
): GameState {
  const active = getActiveAbility(card);
  if (!active) return state;

  return beginResolution(state, {
    active: true, playerId, sourceInstanceId: card.instanceId, effects: active.effects, effectIndex: 0,
    selectedTargetIds: [], lastTargetIds: [], validTargetIds: [], minTargets: 0, maxTargets: 0, mandatory: true, cancelable: false, markActiveUsed: true,
    lastAggregatedStats: state.targetingState?.lastAggregatedStats,
     triggerContext: {
       sourceContext: {
         sourcePlayerId: playerId,
         sourceActionType: 'USE_ACTIVE',
         sourceEffectId: card.definitionId,
       },
     },
  });
}

/** Dispatch a board-wide listener event without making card-specific branches. */
export function resolveBoardListeners(
  state: GameState,
  playerId: string,
  trigger: 'OTHER_ALLY_ATTACK',
  options: Parameters<typeof resolveTriggeredAbilities>[4] = {},
): GameState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return state;
  return player.board.filter((card): card is CardInstance => Boolean(card))
    .filter((card) => card.instanceId !== options.attackerInstanceId)
    .reduce((next, card) => resolveTriggeredAbilities(next, playerId, card, trigger, options), state);
}