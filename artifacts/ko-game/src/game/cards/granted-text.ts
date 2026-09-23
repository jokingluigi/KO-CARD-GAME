import type { CardAbility, CardKeyword } from '../effects/types';
import type { CardInstance, CardDefinition } from './types';

export interface GrantedCardText {
  donorDefinitionId: string;
  rulesText: string;
  keywords: CardKeyword[];
  abilities: CardAbility[];
}

/**
 * The printed fields remain on CardInstance so silence never has to reconstruct
 * them. A grant is a separate layer: while silenced, only the newly granted
 * layer can be active.
 */
export function getActiveCardAbilities(card: CardInstance): CardAbility[] {
  if (card.isSilenced) return card.grantedText?.abilities ?? [];
  return [...card.abilities, ...(card.grantedText?.abilities ?? [])];
}

export function getActiveCardKeywords(card: CardInstance): CardKeyword[] {
  if (card.isSilenced) return card.grantedText?.keywords ?? [];
  return [...new Set([...card.keywords, ...(card.grantedText?.keywords ?? [])])];
}

export function isVanillaCard(card: CardInstance): boolean {
  return card.cardType === 'WRESTLER' &&
    getActiveCardAbilities(card).length === 0 &&
    getActiveCardKeywords(card).length === 0;
}

export function cloneGrantedCardText(
  definition: Pick<CardDefinition, 'id' | 'rulesText' | 'keywords' | 'abilities'>,
): GrantedCardText {
  return {
    donorDefinitionId: definition.id,
    rulesText: definition.rulesText,
    keywords: [...definition.keywords],
    abilities: structuredClone(definition.abilities),
  };
}

export function grantCardText(
  card: CardInstance,
  definition: Pick<CardDefinition, 'id' | 'rulesText' | 'keywords' | 'abilities'>,
): CardInstance {
  const grantedText = cloneGrantedCardText(definition);
  const keywords = getActiveCardKeywords({ ...card, grantedText });
  return {
    ...card,
    grantedText,
    dodgeAvailable: keywords.includes('DODGE'),
    dodgeCharges: keywords.includes('DODGE') ? Math.max(1, card.dodgeCharges ?? 0) : 0,
  };
}

export function removeGrantedCardText(card: CardInstance): CardInstance {
  return {
    ...card,
    grantedText: undefined,
    dodgeAvailable: false,
    dodgeCharges: 0,
  };
}
