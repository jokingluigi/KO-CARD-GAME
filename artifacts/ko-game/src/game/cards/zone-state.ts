import type { CardInstance } from './types';

/**
 * A card entering the graveyard starts its next lifecycle from its definition
 * values. Runtime damage, stat/cost modifiers, and consumed one-shot state do
 * not become part of the graveyard copy.
 */
export function resetCardForGraveyard(card: CardInstance): CardInstance {
  const baseHealth = card.baseHealth ?? card.maxHealth;
  const hasDodge = card.keywords.includes('DODGE');

  return {
    ...card,
    currentCost: card.baseCost ?? card.currentCost,
    temporaryCostUntilTurn: undefined,
    temporaryStatModifiers: [],
    currentAttack: card.baseAttack ?? card.currentAttack,
    currentHealth: baseHealth,
    maxHealth: baseHealth,
    boardSlot: null,
    enteredThisTurn: false,
    attacksUsedThisTurn: 0,
    dodgeAvailable: hasDodge,
    dodgeCharges: hasDodge ? 1 : 0,
    isStunned: false,
    activeUsedThisTurn: false,
    statHistory: [],
  };
}