import { configuredDodgeCharges } from './generation';
import type { CardInstance } from './types';
import type { GameState } from '../types/game-state';
import { getActiveCardKeywords } from './granted-text';
import { getCardDefinition } from './test-cards';

export type CardZone = 'HAND' | 'DECK' | 'BOARD' | 'GRAVEYARD' | 'REMOVED';

/**
 * Hidden-zone WRESTLER cards cannot have less than one current health.
 * Board cards intentionally remain unclamped so lethal damage can retire them.
 */
export function normalizeCardForZone(card: CardInstance, zone: CardZone): CardInstance {
  if (card.cardType !== 'WRESTLER' || (zone !== 'HAND' && zone !== 'DECK')) return card;
  const currentHealth = Math.max(1, card.currentHealth);
  const maxHealth = Math.max(currentHealth, card.maxHealth);
  if (currentHealth === card.currentHealth && maxHealth === card.maxHealth) return card;
  return { ...card, currentHealth, maxHealth };
}

export function normalizeHiddenZoneCards(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: player.hand.map((card) => normalizeCardForZone(card, 'HAND')),
      deck: player.deck.map((card) => normalizeCardForZone(card, 'DECK')),
    })),
  };
}

/**
 * A card entering the graveyard starts its next lifecycle from its definition
 * values. Runtime damage, stat/cost modifiers, and consumed one-shot state do
 * not become part of the graveyard copy.
 */
export function resetCardForGraveyard(card: CardInstance): CardInstance {
  return {
    ...resetCardAfterLeavingBoard(card),
    lastRetiredStats: { attack: card.currentAttack, health: card.currentHealth },
  };
}

/** Restore original stats/cost when a card moves into hand, deck or graveyard. */
export function resetCardAfterLeavingBoard(card: CardInstance): CardInstance {
  const definition = getCardDefinition(card.definitionId);
  const baseHealth = definition?.health ?? card.baseHealth ?? card.maxHealth;
  const hasDodge = getActiveCardKeywords(card).includes('DODGE');

  return {
    ...card,
    lastRetiredStats: undefined,
    currentCost: definition?.cost ?? card.baseCost ?? card.currentCost,
    temporaryCostUntilTurn: undefined,
    temporaryStatModifiers: [],
    currentAttack: definition?.attack ?? card.baseAttack ?? card.currentAttack,
    currentHealth: baseHealth,
    maxHealth: baseHealth,
    boardSlot: null,
    enteredThisTurn: false,
    attacksUsedThisTurn: 0,
    dodgeAvailable: hasDodge,
    dodgeCharges: hasDodge ? card.grantedText?.dodgeCharges ?? configuredDodgeCharges(definition?.effectConfig) : 0,
    isStunned: false,
    activeUsedThisTurn: false,
    statHistory: [],
  };
}
