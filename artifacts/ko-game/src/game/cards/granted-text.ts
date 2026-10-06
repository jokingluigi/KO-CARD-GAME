import { configuredDodgeCharges } from './generation';
import { configuredCountdownTurns } from '@workspace/effect-registry';
import { validChampionQuestCondition } from '../../../../../lib/game-engine/src/champion-quest-conditions';
import type { CardAbility, CardKeyword } from '../effects/types';
import type { CardInstance, CardDefinition } from './types';

export interface GrantedCardText {
  contentRule?: import("./new-card-effects").NewCardRule;
  armor?: number;
  dodgeCharges?: number;
  countdownTurns?: number;
  playCondition?: CardInstance["playCondition"];
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
    ((!card.contentRule || Boolean(card.isSilenced || card.isAbilityDisabled)) && !card.grantedText?.contentRule) &&
    getActiveCardKeywords(card).length === 0;
}

export function cloneGrantedCardText(
  definition: Pick<CardDefinition, 'id' | 'rulesText' | 'keywords' | 'abilities' | 'effectConfig' | 'contentRule'>,
): GrantedCardText {
  return {
    dodgeCharges: configuredDodgeCharges(definition.effectConfig),
    ...(definition.keywords.includes('COUNTDOWN') ? {countdownTurns:configuredCountdownTurns(definition.effectConfig)} : {}),
    ...(typeof definition.effectConfig?.armor === 'number' ? { armor: definition.effectConfig.armor } : {}),
    ...(validChampionQuestCondition(definition.effectConfig?.playCondition) ? { playCondition: structuredClone(definition.effectConfig.playCondition) } : {}),
    donorDefinitionId: definition.id,
    ...(definition.contentRule ? {contentRule: definition.contentRule} : {}),
    rulesText: definition.rulesText,
    keywords: [...definition.keywords],
    abilities: structuredClone(definition.abilities),
  };
}

export function grantCardText(
  card: CardInstance,
  definition: Pick<CardDefinition, 'id' | 'rulesText' | 'keywords' | 'abilities' | 'effectConfig' | 'contentRule'>,
  turn?: number,
): CardInstance {
  const grantedText = cloneGrantedCardText(definition);
  const keywords = getActiveCardKeywords({ ...card, grantedText });
  return {
    ...card,
    grantedText,
    ...(grantedText.keywords.includes('COUNTDOWN') ? {countdownRemaining:grantedText.countdownTurns,countdownResolved:false,countdownLastTickTurn:turn}
      : card.grantedText?.keywords.includes('COUNTDOWN') ? {countdownRemaining:card.keywords.includes('COUNTDOWN') ? card.countdownTurns : undefined,countdownResolved:false,countdownLastTickTurn:turn} : {}),
    dodgeAvailable: keywords.includes('DODGE'),
    dodgeCharges: keywords.includes('DODGE') ? Math.max(grantedText.dodgeCharges ?? 1, card.dodgeCharges ?? 0) : 0,
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
