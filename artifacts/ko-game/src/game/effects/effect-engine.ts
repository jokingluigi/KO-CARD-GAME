import type { CardInstance } from '../cards/types';
import type { CardAbility, CardEffect, CardKeyword } from './types';
import type { GameState } from '../types/game-state';
import type { LeaveReason } from '../events/types';

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
): GameState {
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
          applyEffect(effectState, playerId, card, effect),
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