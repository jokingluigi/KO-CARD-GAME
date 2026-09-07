import type { CardInstance } from '../cards/types';
import type { CardAbility, CardEffect, CardKeyword } from './types';
import type { GameState } from '../types/game-state';
import type { LeaveReason } from '../events/types';
import { shuffle } from '../random/random';
import { destroyCard } from '../engine/destroy-card';

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
    const targetOwner = effect.target.owner === 'SELF' ? playerId : state.players.find((player) => player.id !== playerId)?.id;
    if (!targetOwner) return state;
    const candidatePlayer = state.players.find((player) => player.id === targetOwner);
    if (!candidatePlayer) return state;
    if (effect.target.zone === 'PLAYER') {
      return applyEffect(state, playerId, sourceCard, { type: 'DAMAGE_OPPONENT_CHAMPION', amount });
    }
    const candidates = effect.target.zone === 'HAND'
      ? candidatePlayer.hand
      : candidatePlayer.board.filter((card): card is CardInstance => Boolean(card));
    const eligibleCandidates = candidates.filter((card) => {
      if (card.isDirectDeployedChampion) return false;
      if (!effect.target.cardType) return true;
      return card.cardType === effect.target.cardType;
    });
    const targets = effect.target.selection === 'SELF'
      ? eligibleCandidates.filter((card) => card.instanceId === sourceCard.instanceId)
      : effect.target.selection === 'PLAYER_CHOICE'
        ? eligibleCandidates.filter((card) => chosenTargetInstanceIds?.includes(card.instanceId)).slice(0, Math.max(0, effect.target.count))
        : shuffle(eligibleCandidates).slice(0, Math.max(0, effect.target.count));
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
          if (effect.action === 'BUFF') {
            const health = effect.values?.health ?? 0;
            return { ...card, currentAttack: card.currentAttack + (effect.values?.attack ?? 0), maxHealth: card.maxHealth + health, currentHealth: card.currentHealth + health };
          }
          return card;
        };
        if (player.id !== targetOwner) return player;
        if (effect.target.zone === 'HAND') return { ...player, hand: player.hand.map(update).filter((card): card is CardInstance => Boolean(card)) };
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

  return abilities.reduce(
    (nextState, ability) =>
      ability.effects.reduce(
        (effectState, effect) =>
            applyEffect(effectState, playerId, card, effect, options.chosenTargetInstanceIds),
        nextState,
      ),
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

  return active.effects.reduce(
    (nextState, effect) => applyEffect(nextState, playerId, card, effect),
    state,
  );
}