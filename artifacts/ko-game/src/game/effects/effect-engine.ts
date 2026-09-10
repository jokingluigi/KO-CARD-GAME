import type { CardDefinition, CardInstance } from '../cards/types';
import type { CardAbility, CardEffect, CardKeyword } from './types';
import { RUNTIME_HANDLER_ACTIONS, type Action, type TargetZone } from "@workspace/effect-registry";

// The executor supports exactly the action IDs advertised by the shared library.
// Adding an advertised action requires this assertion (and the executor) to be updated.
const RUNTIME_STRUCTURED_ACTIONS = RUNTIME_HANDLER_ACTIONS satisfies readonly Action[];
type UnimplementedStructuredAction = Exclude<Action, typeof RUNTIME_STRUCTURED_ACTIONS[number]>;
const runtimeStructuredActionsAreExhaustive: UnimplementedStructuredAction extends never ? true : never = true;
void runtimeStructuredActionsAreExhaustive;
import type { GameState } from '../types/game-state';
import type { LeaveReason } from '../events/types';
import { createDeterministicRandom, shuffle } from '../random/random';
import { destroyCard } from '../engine/destroy-card';
import { drawCard } from '../engine/draw-card';
import { silenceCard } from '../engine/card-status';
import { enterField } from '../engine/enter-field';
import { generateCard, generateCardInstance, getRandomCardGenerationCandidates, isEligibleForRandomPool } from '../cards/generation';
import { getAdjacentSlots } from '../engine/board-position';

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
    return owner ? [owner] : [];
  }
  const owners = target.owner === 'ALL'
    ? state.players.map((player) => player.id)
    : [target.owner === 'SELF' ? playerId : state.players.find((p) => p.id !== playerId)?.id].filter((id): id is string => Boolean(id));
  const canTargetPlayer = zones.length === 1 && zones[0] === 'CHARACTER' &&
    (effect.action === 'DAMAGE' || (effect.action === 'HEAL' && target.owner !== 'ENEMY'));
  return owners.flatMap((owner) => {
    const player = state.players.find((candidate) => candidate.id === owner);
    if (!player) return [];
    const cards = cardsInZones(player, zones);
    const cardIds = cards.filter((card) => {
      if (zones.length === 1 && zones[0] === 'CHARACTER' && card.cardType !== 'WRESTLER') return false;
      if (target.cardType && card.cardType !== target.cardType) return false;
      if (target.filter?.isGenerated !== undefined && card.isGenerated !== target.filter.isGenerated) return false;
      if (target.filter?.minCost !== undefined && (card.baseCost ?? card.currentCost) < target.filter.minCost) return false;
      if (target.selection === 'RANDOM' && !isEligibleForRandomPool(card, target.randomScope)) return false;
      if (target.selection === 'SELF' && card.instanceId !== sourceCard.instanceId) return false;
      // Directly deployed champion tokens remain damageable, but not silence/destroy targets.
      if (card.isDirectDeployedChampion && (effect.action === 'SILENCE' || effect.action === 'DESTROY')) return false;
      return true;
    }).map((card) => card.instanceId);
    return canTargetPlayer ? [owner, ...cardIds] : cardIds;
  });
}

function cardsInZones(
  player: GameState['players'][number],
  zones: readonly TargetZone[],
): CardInstance[] {
  const cards = zones.flatMap((zone) => {
    if (zone === 'DECK') return player.deck;
    if (zone === 'HAND') return player.hand;
    if (zone === 'BOARD') return player.board.filter((card): card is CardInstance => card !== null);
    return [];
  });
  return [...new Map(cards.map((card) => [card.instanceId, card])).values()];
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
    const aura = card.abilities
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
  return state.players.flatMap((player) => [...player.deck, ...player.hand, ...player.board.filter((c): c is CardInstance => c !== null)])
    .find((card) => card.instanceId === id);
}

function withLastAggregatedStats(
  state: GameState,
  stats: { attack: number; health: number },
): GameState {
  return state.targetingState
    ? { ...state, targetingState: { ...state.targetingState, lastAggregatedStats: stats } }
    : state;
}

function clearLastAggregatedStats(state: GameState): GameState {
  if (!state.targetingState?.lastAggregatedStats) return state;
  const { lastAggregatedStats: _unused, ...targetingState } = state.targetingState;
  return { ...state, targetingState };
}

function resolveCardDefinition(
  state: GameState,
  definition: CardDefinition | undefined,
  reference: { id?: string; name?: string } | undefined,
): CardDefinition | undefined {
  if (definition) return definition;
  if (!reference) return undefined;
  return state.cardPool?.find((candidate) =>
    (reference.id !== undefined && candidate.id === reference.id) ||
    (reference.name !== undefined && candidate.name === reference.name),
  );
}

type TriggerContext = NonNullable<GameState['targetingState']>['triggerContext'];

function referenceStatValue(
  state: GameState,
  context: TriggerContext | undefined,
  reference: NonNullable<Extract<CardEffect, { type: 'STRUCTURED' }>['values']>['reference'],
  stat: NonNullable<Extract<CardEffect, { type: 'STRUCTURED' }>['values']>['referenceStat'],
): number {
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
  const selected = shuffle(definitions, randomForEffect(state, sourceCard, effect))
    .slice(0, Math.max(0, target.count));

  return selected.reduce((nextState, definition, index) => {
    const generated = generateCard(definition, {
      instanceId: `${sourceCard.instanceId}:${effect.action}:${nextState.events.length + index}`,
      playerId,
      source: { type: 'CARD', cardInstanceId: sourceCard.instanceId },
      reason: effect.action,
    });
    if (effect.action === 'GENERATE') {
      return {
        ...nextState,
        players: nextState.players.map((player) => player.id === playerId
          ? { ...player, hand: [...player.hand, generated.card] }
          : player),
        events: [...nextState.events, generated.event],
      };
    }
    const owner = nextState.players.find((player) => player.id === playerId);
    const slot = owner?.board.findIndex((card) => card === null) ?? -1;
    return slot < 0
      ? nextState
      : enterField(nextState, playerId, generated.card, slot as 0 | 1 | 2 | 3, {
        type: 'CARD',
        cardInstanceId: sourceCard.instanceId,
      });
  }, state);
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
  const selected = shuffle(definitions, randomForEffect(state, sourceCard, effect)).slice(0, slots.length);

  return selected.reduce((nextState, definition, index) => {
    const generated = generateCard(definition, {
      instanceId: `${sourceCard.instanceId}:${effect.action}:${nextState.events.length + index}`,
      playerId,
      source: { type: 'CARD', cardInstanceId: sourceCard.instanceId },
      reason: effect.action,
    });
    return enterField(
      nextState,
      playerId,
      generated.card,
      slots[index]!,
      { type: 'CARD', cardInstanceId: sourceCard.instanceId },
    );
  }, state);
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

export function resolvePendingEffects(state: GameState): GameState {
  const pending = state.targetingState;
  if (!pending) return state;
  // Keep this frame visible while automatic effects execute: a lethal/destroy
  // trigger can then install itself as a child continuation.
  let next: GameState = { ...state, targetingState: pending };
  let last = pending.lastTargetIds;
  for (let index = pending.effectIndex; index < pending.effects.length; index += 1) {
    const effect = pending.effects[index];
    const source = pending.sourceCard ?? sourceInState(next, pending.sourceInstanceId);
    if (!source) return next;
    if (effect.type === 'STRUCTURED' && effect.target?.selection === 'PLAYER_CHOICE') {
      const validTargetIds = getValidTargets(next, pending.playerId, source, effect);
      const minTargets = effect.target.minTargets ?? effect.target.count;
      const maxTargets = effect.target.maxTargets ?? effect.target.count;
      return { ...next, targetingState: { ...pending, effectIndex: index, selectedTargetIds: [], lastTargetIds: last, validTargetIds, minTargets, maxTargets, mandatory: !effect.target.optionalTarget, cancelable: Boolean(effect.target.optionalTarget) } };
    }
    const ids = effect.type === 'STRUCTURED' && effect.target?.selection === 'SAME_TARGET' ? last : undefined;
     next = applyEffect(next, pending.playerId, source, effect, ids, pending.triggerContext);
    if (next.targetingState?.continuation &&
      next.targetingState.continuation.sourceInstanceId === pending.sourceInstanceId &&
      next.targetingState.continuation.effectIndex > pending.effectIndex) return next;
    if (ids?.length) last = ids;
     if (next.targetingState?.sourceInstanceId === pending.sourceInstanceId) {
       last = next.targetingState.lastTargetIds;
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
  return pending.continuation
    ? resolvePendingEffects({ ...next, targetingState: pending.continuation })
    : { ...next, targetingState: undefined };
}

export function selectEffectTarget(state: GameState, targetId: string): GameState {
  const pending = state.targetingState;
  if (!pending) return state;
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
  if (next.targetingState?.continuation === parentAfter) return next;
  return resolvePendingEffects(next);
}

/** Cancellation is intentionally limited to explicitly optional target effects. */
export function cancelEffectTargeting(state: GameState): GameState {
  const pending = state.targetingState;
  if (!pending || !pending.cancelable || pending.selectedTargetIds.length > 0) return state;
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

export function hasMandatoryPlayerChoice(state: GameState, playerId: string, source: CardInstance, effects: CardEffect[]): boolean {
  return effects.some((effect) => effect.type === 'STRUCTURED' && effect.target?.selection === 'PLAYER_CHOICE' &&
    !effect.target.optionalTarget && getValidTargets(state, playerId, source, effect).length < (effect.target.minTargets ?? effect.target.count));
}

export function hasKeyword(
  card: CardInstance,
  keyword: CardKeyword,
): boolean {
  return !card.isSilenced && card.keywords.includes(keyword);
}

export function getActiveAbility(
  card: CardInstance,
): Extract<CardAbility, { trigger: 'ACTIVE' }> | undefined {
  return card.isSilenced
    ? undefined
    : card.abilities.find(
        (ability): ability is Extract<CardAbility, { trigger: 'ACTIVE' }> =>
          ability.trigger === 'ACTIVE',
      );
}

function applyEffect(
  state: GameState,
  playerId: string,
  sourceCard: CardInstance,
  effect: CardEffect,
  chosenTargetInstanceIds?: string[],
  triggerContext?: TriggerContext,
): GameState {
  if (effect.type === 'STRUCTURED') {
    if (effect.action === 'SUMMON' && effect.target?.selection === 'ADJACENT_EMPTY_SLOTS') {
      return applyAdjacentRandomCardCreation(state, playerId, sourceCard, effect);
    }
    if ((effect.action === 'SUMMON' || effect.action === 'GENERATE') && effect.target?.selection === 'RANDOM') {
      return applyRandomCardCreation(state, playerId, sourceCard, effect);
    }
    const amount = effect.values?.amount ?? 0;
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
    if (effect.action === 'SUMMON' || effect.action === 'GENERATE') {
      // These actions require a data-only definition; an absent/malformed
      // reference is a rejected effect, never an advertised silent no-op.
      if (!validDefinition) throw new Error(`${effect.action} requires a serializable card definition.`);
      const owner = state.players.find((player) => player.id === playerId);
      if (!owner) return state;
      const generatedBase = generateCardInstance(definition, {
        instanceId: `${sourceCard.instanceId}:${effect.action}:${state.events.length}`,
        isGenerated: true,
      });
      const aggregate = effect.action === 'SUMMON' && effect.values?.aggregateStats?.source === 'LAST_DESTROYED_TARGETS'
        ? state.targetingState?.lastAggregatedStats
        : undefined;
      const generated = aggregate
        ? {
            ...generatedBase,
            currentAttack: aggregate.attack,
            currentHealth: aggregate.health,
            maxHealth: aggregate.health,
          }
        : generatedBase;
      if (effect.action === 'GENERATE') {
        return {
          ...state,
          players: state.players.map((player) => player.id === playerId
            ? { ...player, hand: [...player.hand, generated] } : player),
          events: [...state.events, { type: 'CARD_GENERATED', playerId, cardInstanceId: generated.instanceId,
            source: { type: 'CARD', cardInstanceId: sourceCard.instanceId },
            target: { type: 'CARD', cardInstanceId: generated.instanceId }, reason: 'GENERATE' }],
        };
      }
      const slot = owner.board.findIndex((card) => card === null);
      if (slot < 0) return state;
      const summonState = clearLastAggregatedStats({
        ...state,
        targetingState: state.targetingState
          ? { ...state.targetingState, lastTargetIds: [generated.instanceId] }
          : state.targetingState,
      });
      return enterField(summonState, playerId, generated, slot as 0 | 1 | 2 | 3,
        { type: 'CARD', cardInstanceId: sourceCard.instanceId });
    }
    if (effect.action === 'SWITCH_EFFECT_BRANCH') {
      const branch = sourceCard.boardSlot !== null && sourceCard.boardSlot <= 1
        ? effect.values?.leftEffects : effect.values?.rightEffects;
      if (!branch || !Array.isArray(branch)) throw new Error('SWITCH_EFFECT_BRANCH requires leftEffects and rightEffects.');
       return branch.reduce((next, child) => applyEffect(next, playerId, sourceCard, child, undefined, triggerContext), state);
    }
    if (effect.action === 'ADD_GOLD') {
      return applyEffect(state, playerId, sourceCard, { type: 'GAIN_GOLD', amount });
    }
    if (effect.action === 'ADD_NEXT_TURN_GOLD') {
      return { ...state, players: state.players.map((player) => player.id === playerId ? { ...player, nextTurnGoldBonus: player.nextTurnGoldBonus + amount } : player) };
    }
    if (effect.action === 'QUEUE_EFFECT') {
      const queuedEffect = effect.values?.queuedEffect;
      if (effect.values?.queuedTrigger !== 'NEXT_ALLY_WRESTLER_PLAYED' || !queuedEffect) {
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
          },
        ],
      };
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
        dodgeCharges: captured.baseSnapshot.dodgeCharges ?? (captured.baseSnapshot.keywords.includes('DODGE') ? 1 : 0),
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
      return enterField(withoutCaptured, playerId, released, slot as 0 | 1 | 2 | 3, { type: 'CARD', cardInstanceId: sourceCard.instanceId });
    }
    if (!effect.target) return state;
    const target = effect.target;
    // Costs belong to cards in hand, never to a character (which can include a
    // champion/player id). Keep malformed legacy payloads from changing board
    // cards through this broader target zone.
    const zones = target.zones ?? (target.zone ? [target.zone] : []);
    if (zones.length === 1 && zones[0] === 'CHARACTER' &&
      (effect.action === 'REDUCE_COST' || effect.action === 'INCREASE_COST')) return state;
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
        }), state);
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
        }, [cardId]);
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
                graveyard: defeated ? [...player.graveyard, { ...directChampion, currentHealth: health, boardSlot: null }] : player.graveyard,
              }
            : {
                ...player,
                health,
                champion: player.champion ? { ...player.champion, health } : null,
              }),
        };
      }
      return target.owner === 'ENEMY'
        ? applyEffect(state, playerId, sourceCard, { type: 'DAMAGE_OPPONENT_CHAMPION', amount: damageAmount })
        : state;
    }
    const candidates = cardsInZones(candidatePlayer, zones);
    const eligibleCandidates = candidates.filter((card) => {
      if (card.isDirectDeployedChampion && (effect.action === 'SILENCE' || effect.action === 'DESTROY')) return false;
      if (target.cardType && card.cardType !== target.cardType) return false;
      if (target.filter?.isGenerated !== undefined && card.isGenerated !== target.filter.isGenerated) return false;
      if (target.filter?.minCost !== undefined && (card.baseCost ?? card.currentCost) < target.filter.minCost) return false;
      return true;
    });
    const randomCandidates = eligibleCandidates.filter((card) =>
      target.selection !== 'RANDOM' || isEligibleForRandomPool(card, target.randomScope),
    );
    const targets = target.selection === 'SELF'
      ? eligibleCandidates.filter((card) => card.instanceId === sourceCard.instanceId)
      : target.selection === 'PLAYER_CHOICE'
        ? eligibleCandidates.filter((card) => chosenTargetInstanceIds?.includes(card.instanceId)).slice(0, Math.max(0, target.count))
        : target.selection === 'SAME_TARGET'
          ? eligibleCandidates.filter((card) => chosenTargetInstanceIds?.includes(card.instanceId)).slice(0, Math.max(0, target.count))
        : target.selection === 'ALL'
          ? eligibleCandidates
          : shuffle(
              randomCandidates,
              randomForEffect(state, sourceCard, effect),
            ).slice(0, Math.max(0, target.count));
    if (!targets.length) {
      return effect.action === 'DESTROY'
        ? withLastAggregatedStats(state, { attack: 0, health: 0 })
        : state;
    }
    const ids = new Set(targets.map((card) => card.instanceId));
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
        if (current.isDirectDeployedChampion) {
          return applyEffect(nextState, playerId, sourceCard, {
            type: 'DAMAGE_OPPONENT_CHAMPION',
            amount: damageAmount,
          });
        }
        // Legacy snapshots may carry dodgeAvailable=true with a missing or
        // zero-initialized charge count. The boolean remains authoritative for
        // that compatibility case; newly created cards keep both fields aligned.
        const dodgeCharges = Math.max(
          current.dodgeCharges ?? 0,
          current.dodgeAvailable ? 1 : 0,
        );
        const dodged = damageAmount > 0 && dodgeCharges > 0 && hasKeyword(current, 'DODGE');
        if (dodged) {
          return {
            ...nextState,
            players: nextState.players.map((player) => player.id === targetOwner
              ? { ...player, board: player.board.map((card) => card?.instanceId === current.instanceId ? { ...card, dodgeAvailable: dodgeCharges > 1, dodgeCharges: dodgeCharges - 1 } : card) as typeof player.board }
              : player),
            events: [...nextState.events, { type: 'DAMAGE_DEALT', playerId, cardInstanceId: sourceCard.instanceId, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'CARD_EFFECT', amount: 0 }],
          };
        }
        const health = current.currentHealth - damageAmount;
        if (health > 0) {
          return {
            ...nextState,
            players: nextState.players.map((player) => player.id === targetOwner
              ? { ...player, board: player.board.map((card) => card?.instanceId === current.instanceId ? { ...card, currentHealth: health } : card) as typeof player.board }
              : player),
            events: [...nextState.events, { type: 'DAMAGE_DEALT', playerId, cardInstanceId: sourceCard.instanceId, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'CARD_EFFECT', amount: damageAmount }],
          };
        }
        const retired: CardInstance = { ...current, currentHealth: health, boardSlot: null };
        const retiredState: GameState = {
          ...nextState,
          players: nextState.players.map((player) => player.id === targetOwner
            ? { ...player, board: player.board.map((card) => card?.instanceId === current.instanceId ? null : card) as typeof player.board, graveyard: [...player.graveyard, retired] }
            : player),
          events: [...nextState.events,
            { type: 'DAMAGE_DEALT', playerId, cardInstanceId: sourceCard.instanceId, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'CARD_EFFECT', amount: damageAmount },
            { type: 'CARD_RETIRED', playerId: targetOwner, cardInstanceId: current.instanceId, boardSlot: current.boardSlot!, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'RETIRE' },
          ],
        };
        const exactZeroState = health === 0
          ? resolveTriggeredAbilities(retiredState, playerId, sourceCard, 'EXACT_ZERO_DAMAGE', {
            damagedTargetInstanceId: current.instanceId, healthBefore: current.currentHealth, healthAfter: health,
          })
          : retiredState;
        return resolveTriggeredAbilities(exactZeroState, targetOwner, current, 'LEAVE_FIELD', { leaveReason: 'RETIRE' });
      }, state);
    }
    if (effect.action === 'SILENCE') {
      return [...ids].reduce((nextState, id) => silenceCard(nextState, id), state);
    }
    return {
      ...state,
      players: state.players.map((player) => {
         const update = (card: CardInstance): CardInstance => {
          if (!ids.has(card.instanceId)) return card;
           if (effect.action === 'SILENCE') return card; // resolved centrally below
            if (effect.action === 'ADD_KEYWORD' && effect.values?.keyword && !card.keywords.includes(effect.values.keyword)) return { ...card, keywords: [...card.keywords, effect.values.keyword], dodgeAvailable: effect.values.keyword === 'DODGE' ? true : card.dodgeAvailable, dodgeCharges: effect.values.keyword === 'DODGE' ? Math.max(1, card.dodgeCharges ?? 0) : card.dodgeCharges };
            if (effect.action === 'REMOVE_KEYWORD' && effect.values?.keyword) return { ...card, keywords: card.keywords.filter((keyword) => keyword !== effect.values?.keyword), dodgeAvailable: effect.values.keyword === 'DODGE' ? false : card.dodgeAvailable, dodgeCharges: effect.values.keyword === 'DODGE' ? 0 : card.dodgeCharges };
           if (effect.action === 'STUN') return { ...card, isStunned: true };
           if (effect.action === 'REDUCE_COST') return { ...card, currentCost: Math.max(0, card.currentCost - amount) };
           if (effect.action === 'INCREASE_COST') return { ...card, currentCost: card.currentCost + amount };
           if (effect.action === 'HEAL') return { ...card, currentHealth: Math.min(card.maxHealth, card.currentHealth + amount) };
           if (effect.action === 'BUFF') {
            const health = effect.values?.health ?? 0;
             const attackMultiplier = effect.values?.attackMultiplier ?? 1;
             const healthMultiplier = effect.values?.healthMultiplier ?? 1;
             return {
               ...card,
                currentAttack: card.currentAttack * attackMultiplier + (effect.values?.attack ?? 0) + referenceAmount,
               maxHealth: card.maxHealth * healthMultiplier + health,
               currentHealth: card.currentHealth * healthMultiplier + health,
             };
          }
           if (effect.action === 'SET_STATS') {
             return {
               ...card,
               ...(effect.values?.attack !== undefined ? { currentAttack: effect.values.attack } : {}),
               ...(effect.values?.health !== undefined ? {
                 currentHealth: effect.values.health,
                 maxHealth: Math.max(card.maxHealth, effect.values.health),
               } : {}),
             };
           }
           if (effect.action === 'SWAP_STATS') {
             return {
               ...card,
               currentAttack: card.currentHealth,
               currentHealth: card.currentAttack,
             };
           }
          return card;
        };
        if (player.id !== targetOwner) return player;
         const updatedDeck = zones.includes('DECK') ? player.deck.map(update) : player.deck;
         const updatedHand = zones.includes('HAND') ? player.hand.map(update) : player.hand;
         const updatedBoard = zones.includes('BOARD')
           ? player.board.map((card) => card ? update(card) : null) as typeof player.board
           : player.board;
         return { ...player, deck: updatedDeck, hand: updatedHand, board: updatedBoard };
      }),
    };
  }
  if (effect.type === 'GAIN_GOLD') {
    return {
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
  }

  if (effect.type === 'DAMAGE_OPPONENT_CHAMPION') {
    const opponent = state.players.find((player) => player.id !== playerId);
    if (!opponent) return state;

    const directChampion =
      opponent.board.find((card) => card?.isDirectDeployedChampion) ?? null;
    const remainingHealth = directChampion
      ? directChampion.currentHealth - effect.amount
      : opponent.health - effect.amount;
    const defeated = remainingHealth <= 0;

    return {
      ...state,
      status: defeated ? 'FINISHED' : state.status,
      activePlayerId: defeated ? null : state.activePlayerId,
      winnerId: defeated ? playerId : state.winnerId,
      loserId: defeated ? opponent.id : state.loserId,
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
              ? [...player.graveyard, damagedChampion]
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
        },
        ...(defeated && directChampion
          ? [
              {
                type: 'CARD_RETIRED' as const,
                playerId: opponent.id,
                cardInstanceId: directChampion.instanceId,
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
              },
            ]
          : []),
      ],
    };
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
    (pending) => pending.playerId === playerId && pending.trigger === 'NEXT_ALLY_WRESTLER_PLAYED',
  );
  if (!queued.length) return state;

  let next = {
    ...state,
    pendingCardEffects: (state.pendingCardEffects ?? []).filter(
      (pending) => !(pending.playerId === playerId && pending.trigger === 'NEXT_ALLY_WRESTLER_PLAYED'),
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
        target: pending.effect.target ?? { zone: 'BOARD', owner: 'SELF', selection: 'SELF', count: 1 },
        values: pending.effect.values,
      },
    );
  }
  return next;
}

export function resolveTriggeredAbilities(
  state: GameState,
  playerId: string,
  card: CardInstance,
  trigger: 'ENTER_FIELD' | 'LEAVE_FIELD' | 'POSITION' | 'ACTIVE' | 'CARD_DRAWN' | 'OTHER_ALLY_ATTACK' | 'TECHNIQUE_CAST' | 'EXACT_ZERO_DAMAGE' | 'TURN_START' | 'TURN_END',
  options: {
    boardSlot?: 0 | 1 | 2 | 3;
    leaveReason?: LeaveReason;
    chosenTargetInstanceIds?: string[];
    playedFromHand?: boolean;
    baseCost?: number;
    attackerInstanceId?: string;
    damagedTargetInstanceId?: string;
    healthBefore?: number;
    healthAfter?: number;
  } = {},
): GameState {
  if (card.isSilenced) return state;

  const compare = (actual: number, condition: 'GTE' | 'LTE' | 'EQ', expected: number) =>
    condition === 'GTE' ? actual >= expected : condition === 'LTE' ? actual <= expected : actual === expected;
  const abilities = card.abilities.filter((ability) => {
    if (ability.trigger !== trigger) return false;
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
      if (condition.type === 'HAS_MATCHING_TAG_PLAYED_THIS_TURN') {
        const tags = card.tags ?? [];
        const lastTurnStart = state.events.map((event, index) => ({ event, index }))
          .filter(({ event }) => event.type === 'TURN_STARTED' && event.playerId === playerId).at(-1)?.index ?? -1;
        const played = state.events.slice(lastTurnStart + 1)
          .filter((event) => event.type === 'CARD_PLAYED' && event.playerId === playerId && event.cardInstanceId !== card.instanceId);
        if (!played.some((event) => event.tags?.some((tag) => tags.includes(tag)))) return false;
      }
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
    effectIndex: 0, selectedTargetIds: [], lastTargetIds: options.chosenTargetInstanceIds ?? [],
    validTargetIds: [], minTargets: 0, maxTargets: 0, mandatory: true, cancelable: false,
     triggerContext: { playedFromHand: options.playedFromHand, baseCost: options.baseCost, attackerInstanceId: options.attackerInstanceId, damagedTargetInstanceId: options.damagedTargetInstanceId, healthBefore: options.healthBefore, healthAfter: options.healthAfter },
     lastAggregatedStats: state.targetingState?.lastAggregatedStats,
  });
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