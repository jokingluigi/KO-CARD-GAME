import type { CardInstance } from '../cards/types';
import type { CardAbility, CardEffect, CardKeyword } from './types';
import { RUNTIME_HANDLER_ACTIONS, type Action } from "@workspace/effect-registry";

// The executor supports exactly the action IDs advertised by the shared library.
// Adding an advertised action requires this assertion (and the executor) to be updated.
const RUNTIME_STRUCTURED_ACTIONS = RUNTIME_HANDLER_ACTIONS satisfies readonly Action[];
type UnimplementedStructuredAction = Exclude<Action, typeof RUNTIME_STRUCTURED_ACTIONS[number]>;
const runtimeStructuredActionsAreExhaustive: UnimplementedStructuredAction extends never ? true : never = true;
void runtimeStructuredActionsAreExhaustive;
import type { GameState } from '../types/game-state';
import type { LeaveReason } from '../events/types';
import { shuffle } from '../random/random';
import { destroyCard } from '../engine/destroy-card';
import { drawCard } from '../engine/draw-card';

/** The single authoritative target resolver.  UI must only display these ids. */
export function getValidTargets(
  state: GameState,
  playerId: string,
  sourceCard: CardInstance,
  effect: CardEffect,
): string[] {
  if (effect.type !== 'STRUCTURED' || !effect.target) return [];
  const target = effect.target;
  if (target.zone === 'PLAYER') {
    if (target.owner === 'ALL') return [];
    const owner = target.owner === 'SELF' ? playerId : state.players.find((p) => p.id !== playerId)?.id;
    return owner ? [owner] : [];
  }
  const owners = target.owner === 'ALL'
    ? state.players.map((player) => player.id)
    : [target.owner === 'SELF' ? playerId : state.players.find((p) => p.id !== playerId)?.id].filter((id): id is string => Boolean(id));
  const canTargetPlayer = target.zone === 'CHARACTER' &&
    (effect.action === 'DAMAGE' || (effect.action === 'HEAL' && target.owner !== 'ENEMY'));
  return owners.flatMap((owner) => {
    const player = state.players.find((candidate) => candidate.id === owner);
    if (!player) return [];
    const cards = target.zone === 'HAND' ? player.hand : player.board.filter((c): c is CardInstance => c !== null);
    const cardIds = cards.filter((card) => {
      if (target.zone === 'CHARACTER' && card.cardType !== 'WRESTLER') return false;
      if (target.cardType && card.cardType !== target.cardType) return false;
      if (target.selection === 'SELF' && card.instanceId !== sourceCard.instanceId) return false;
      // Directly deployed champion tokens remain damageable, but not silence/destroy targets.
      if (card.isDirectDeployedChampion && (effect.action === 'SILENCE' || effect.action === 'DESTROY')) return false;
      return true;
    }).map((card) => card.instanceId);
    return canTargetPlayer ? [owner, ...cardIds] : cardIds;
  });
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
  return state.players.flatMap((player) => [...player.board.filter((c): c is CardInstance => c !== null), ...player.hand])
    .find((card) => card.instanceId === id);
}

function beginResolution(state: GameState, frame: NonNullable<GameState['targetingState']>): GameState {
  return resolvePendingEffects({
    ...state,
    targetingState: {
      ...frame,
      continuation: state.targetingState?.active ? state.targetingState : frame.continuation,
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
    next = applyEffect(next, pending.playerId, source, effect, ids);
    if (next.targetingState?.continuation === pending) return next;
    if (ids?.length) last = ids;
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
  next = applyEffect(next, pending.playerId, source, effect, selected);
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
): GameState {
  if (effect.type === 'STRUCTURED') {
    const amount = effect.values?.amount ?? 0;
    if (effect.action === 'ADD_GOLD') {
      return applyEffect(state, playerId, sourceCard, { type: 'GAIN_GOLD', amount });
    }
    if (effect.action === 'ADD_NEXT_TURN_GOLD') {
      return { ...state, players: state.players.map((player) => player.id === playerId ? { ...player, nextTurnGoldBonus: player.nextTurnGoldBonus + amount } : player) };
    }
    if (effect.action === 'DRAW') {
      return Array.from({ length: amount }).reduce<GameState>(
        (nextState) => nextState.status === 'FINISHED' ? nextState : drawCard(nextState, playerId),
        state,
      );
    }
    if (!effect.target) return state;
    const target = effect.target;
    // Costs belong to cards in hand, never to a character (which can include a
    // champion/player id). Keep malformed legacy payloads from changing board
    // cards through this broader target zone.
    if (target.zone === 'CHARACTER' &&
      (effect.action === 'REDUCE_COST' || effect.action === 'INCREASE_COST')) return state;
    const targetOwner = target.owner === 'SELF' ? playerId : state.players.find((player) => player.id !== playerId)?.id;
    if (!targetOwner) return state;
    const candidatePlayer = state.players.find((player) => player.id === targetOwner);
    if (!candidatePlayer) return state;
    if (target.zone === 'CHARACTER') {
      const validIds = getValidTargets(state, playerId, sourceCard, effect);
      const selectedIds = target.selection === 'ALL'
        ? validIds
        : chosenTargetInstanceIds?.filter((id) => validIds.includes(id)) ?? [];
      const playerIds = selectedIds.filter((id) => state.players.some((player) => player.id === id));
      const cardIds = selectedIds.filter((id) => !playerIds.includes(id));
      const afterPlayers = playerIds.reduce((nextState, owner) =>
        applyEffect(nextState, playerId, sourceCard, {
          ...effect,
          target: { ...target, zone: 'PLAYER', owner: owner === playerId ? 'SELF' : 'ENEMY', selection: 'SELF', count: 1 },
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
          target: { ...target, zone: 'BOARD', owner: owner === playerId ? 'SELF' : 'ENEMY', cardType: 'WRESTLER', selection: 'PLAYER_CHOICE', count: 1 },
        }, [cardId]);
      }, afterPlayers);
    }
    if (target.zone === 'PLAYER' && effect.action === 'HEAL') {
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
    if (target.zone === 'PLAYER') {
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
        ? applyEffect(state, playerId, sourceCard, { type: 'DAMAGE_OPPONENT_CHAMPION', amount })
        : state;
    }
    const candidates = target.zone === 'HAND'
      ? candidatePlayer.hand
      : candidatePlayer.board.filter((card): card is CardInstance => Boolean(card));
    const eligibleCandidates = candidates.filter((card) => {
      if (card.isDirectDeployedChampion && (effect.action === 'SILENCE' || effect.action === 'DESTROY')) return false;
      if (!target.cardType) return true;
      return card.cardType === target.cardType;
    });
    const targets = target.selection === 'SELF'
      ? eligibleCandidates.filter((card) => card.instanceId === sourceCard.instanceId)
      : target.selection === 'PLAYER_CHOICE'
        ? eligibleCandidates.filter((card) => chosenTargetInstanceIds?.includes(card.instanceId)).slice(0, Math.max(0, target.count))
        : target.selection === 'SAME_TARGET'
          ? eligibleCandidates.filter((card) => chosenTargetInstanceIds?.includes(card.instanceId)).slice(0, Math.max(0, target.count))
        : target.selection === 'ALL'
          ? eligibleCandidates
          : shuffle(eligibleCandidates).slice(0, Math.max(0, target.count));
    if (!targets.length) return state;
    const ids = new Set(targets.map((card) => card.instanceId));
    if (effect.action === 'DESTROY') {
      return targets.reduce((nextState, target) => {
        const result = destroyCard(nextState, targetOwner, target.instanceId);
        return result.success ? result.state : nextState;
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
            amount,
          });
        }
        const dodged = amount > 0 && current.dodgeAvailable && hasKeyword(current, 'DODGE');
        if (dodged) {
          return {
            ...nextState,
            players: nextState.players.map((player) => player.id === targetOwner
              ? { ...player, board: player.board.map((card) => card?.instanceId === current.instanceId ? { ...card, dodgeAvailable: false } : card) as typeof player.board }
              : player),
            events: [...nextState.events, { type: 'DAMAGE_DEALT', playerId, cardInstanceId: sourceCard.instanceId, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'CARD_EFFECT', amount: 0 }],
          };
        }
        const health = current.currentHealth - amount;
        if (health > 0) {
          return {
            ...nextState,
            players: nextState.players.map((player) => player.id === targetOwner
              ? { ...player, board: player.board.map((card) => card?.instanceId === current.instanceId ? { ...card, currentHealth: health } : card) as typeof player.board }
              : player),
            events: [...nextState.events, { type: 'DAMAGE_DEALT', playerId, cardInstanceId: sourceCard.instanceId, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'CARD_EFFECT', amount }],
          };
        }
        const retired: CardInstance = { ...current, currentHealth: health, boardSlot: null };
        const retiredState: GameState = {
          ...nextState,
          players: nextState.players.map((player) => player.id === targetOwner
            ? { ...player, board: player.board.map((card) => card?.instanceId === current.instanceId ? null : card) as typeof player.board, graveyard: [...player.graveyard, retired] }
            : player),
          events: [...nextState.events,
            { type: 'DAMAGE_DEALT', playerId, cardInstanceId: sourceCard.instanceId, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'CARD_EFFECT', amount },
            { type: 'CARD_RETIRED', playerId: targetOwner, cardInstanceId: current.instanceId, boardSlot: current.boardSlot!, source: { type: 'CARD', cardInstanceId: sourceCard.instanceId }, target: { type: 'CARD', cardInstanceId: current.instanceId }, reason: 'RETIRE' },
          ],
        };
        return resolveTriggeredAbilities(retiredState, targetOwner, current, 'LEAVE_FIELD', { leaveReason: 'RETIRE' });
      }, state);
    }
    return {
      ...state,
      players: state.players.map((player) => {
        const update = (card: CardInstance): CardInstance | null => {
          if (!ids.has(card.instanceId)) return card;
          if (effect.action === 'SILENCE') return { ...card, isSilenced: true };
           if (effect.action === 'ADD_KEYWORD' && effect.values?.keyword && !card.keywords.includes(effect.values.keyword)) return { ...card, keywords: [...card.keywords, effect.values.keyword], dodgeAvailable: effect.values.keyword === 'DODGE' ? true : card.dodgeAvailable };
           if (effect.action === 'REMOVE_KEYWORD' && effect.values?.keyword) return { ...card, keywords: card.keywords.filter((keyword) => keyword !== effect.values?.keyword), dodgeAvailable: effect.values.keyword === 'DODGE' ? false : card.dodgeAvailable };
           if (effect.action === 'STUN') return { ...card, isStunned: true };
           if (effect.action === 'REDUCE_COST') return { ...card, currentCost: Math.max(0, card.currentCost - amount) };
           if (effect.action === 'INCREASE_COST') return { ...card, currentCost: card.currentCost + amount };
           if (effect.action === 'HEAL') return { ...card, currentHealth: Math.min(card.maxHealth, card.currentHealth + amount) };
          if (effect.action === 'BUFF') {
            const health = effect.values?.health ?? 0;
            return { ...card, currentAttack: card.currentAttack + (effect.values?.attack ?? 0), maxHealth: card.maxHealth + health, currentHealth: card.currentHealth + health };
          }
          return card;
        };
        if (player.id !== targetOwner) return player;
         if (target.zone === 'HAND') return { ...player, hand: player.hand.map(update).filter((card): card is CardInstance => Boolean(card)) };
        const retired = player.board.filter((card): card is CardInstance => Boolean(card && ids.has(card.instanceId) && effect.action === 'DAMAGE' && card.currentHealth - amount <= 0 && !card.isDirectDeployedChampion));
        return { ...player, board: player.board.map((card) => card ? update(card) : null) as typeof player.board, graveyard: [...player.graveyard, ...retired] };
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

export function resolveTriggeredAbilities(
  state: GameState,
  playerId: string,
  card: CardInstance,
  trigger: 'ENTER_FIELD' | 'LEAVE_FIELD' | 'POSITION',
  options: {
    boardSlot?: 0 | 1 | 2 | 3;
    leaveReason?: LeaveReason;
    chosenTargetInstanceIds?: string[];
  } = {},
): GameState {
  if (card.isSilenced) return state;

  const abilities = card.abilities.filter((ability) => {
    if (ability.trigger !== trigger) return false;
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
  });
}