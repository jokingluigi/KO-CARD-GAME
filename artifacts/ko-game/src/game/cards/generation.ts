import type {
  CardDefinition,
  CardInstance,
  CardInstanceId,
} from './types';
import type { EventSubject, GameEvent } from '../events/types';

export interface GenerateCardOptions {
  instanceId: CardInstanceId;
  isToken?: boolean;
  isChampionToken?: boolean;
}

export interface GenerateCardWithEventOptions extends GenerateCardOptions {
  playerId: string;
  source?: EventSubject;
  reason?: string;
}

export function generateCardInstance(
  definition: CardDefinition,
  options: GenerateCardOptions,
): CardInstance {
  return {
    instanceId: options.instanceId,
    definitionId: definition.id,
    currentCost: definition.cost,
    currentAttack: definition.attack,
    currentHealth: definition.health,
    maxHealth: definition.health,
    boardSlot: null,
    enteredThisTurn: false,
    attacksUsedThisTurn: 0,
    isGenerated: true,
    isToken: options.isToken ?? definition.isToken,
    isChampionToken:
      options.isChampionToken ?? definition.isChampionToken,
    keywords: [...definition.keywords],
    abilities: [...definition.abilities],
    isSilenced: false,
    isSilenceImmune: false,
    dodgeAvailable: definition.keywords.includes('DODGE'),
    isStunned: false,
    activeUsedThisTurn: false,
    isDirectDeployedChampion: false,
  };
}

export function generateCard(
  definition: CardDefinition,
  options: GenerateCardWithEventOptions,
): { card: CardInstance; event: GameEvent } {
  const card = generateCardInstance(definition, options);

  return {
    card,
    event: {
      type: 'CARD_GENERATED',
      playerId: options.playerId,
      cardInstanceId: card.instanceId,
      source: options.source ?? { type: 'SYSTEM' },
      target: { type: 'CARD', cardInstanceId: card.instanceId },
      reason: options.reason ?? 'CARD_EFFECT',
    },
  };
}

export function getRandomCardGenerationCandidates(
  definitions: readonly CardDefinition[],
): CardDefinition[] {
  return definitions.filter((definition) => !definition.isChampionToken);
}