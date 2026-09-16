import type {
  CardDefinition,
  CardInstance,
  CardInstanceId,
} from './types';
import type { RandomScope } from '@workspace/effect-registry';
import type { EventAttribution, EventSubject, GameEvent } from '../events/types';

export interface GenerateCardOptions {
  instanceId: CardInstanceId;
  /** Existing deck/hand instances are not generated; creation effects opt in. */
  isGenerated?: boolean;
  isToken?: boolean;
  isChampionToken?: boolean;
  statModifiers?: { cost?: number; attack?: number; health?: number; copySourceStats?: { attack: number; health: number } };
}

export interface GenerateCardWithEventOptions extends GenerateCardOptions {
  playerId: string;
  source?: EventSubject;
  reason?: string;
  sourceContext?: EventAttribution;
}

export interface RandomCardPoolOptions {
  randomScope?: RandomScope;
  cardType?: CardDefinition['cardType'];
  filter?: {
    isGenerated?: boolean;
    minCost?: number;
    tags?: string[];
    isToken?: boolean;
    isChampionToken?: boolean;
  };
}

export function isEligibleForRandomPool(
  card: Pick<CardDefinition, 'isToken' | 'isChampionToken'> | Pick<CardInstance, 'isToken' | 'isChampionToken'>,
  randomScope: RandomScope = 'STANDARD',
): boolean {
  return randomScope === 'FULL' || (!card.isToken && !card.isChampionToken);
}

export function generateCardInstance(
  definition: CardDefinition,
  options: GenerateCardOptions,
): CardInstance {
  const copiedStats = options.statModifiers?.copySourceStats;
  const attack = copiedStats?.attack ?? definition.attack + (options.statModifiers?.attack ?? 0);
  const health = copiedStats?.health ?? definition.health + (options.statModifiers?.health ?? 0);
  return {
    instanceId: options.instanceId,
    definitionId: definition.id,
    cardType: definition.cardType ?? 'WRESTLER',
    currentCost: Math.max(1, definition.cost + (options.statModifiers?.cost ?? 0)),
    baseCost: definition.cost,
    baseAttack: definition.attack,
    baseHealth: definition.health,
    currentAttack: Math.max(0, attack),
    currentHealth: Math.max(1, health),
    maxHealth: Math.max(1, health),
    boardSlot: null,
    enteredThisTurn: false,
    attacksUsedThisTurn: 0,
    isGenerated: options.isGenerated ?? false,
    isToken: options.isToken ?? definition.isToken,
    isChampionToken:
      options.isChampionToken ?? definition.isChampionToken,
    entranceAudioAssetId: definition.entranceAudioAssetId,
    entranceAudioUrl: definition.entranceAudioUrl,
    entranceAudioVolume: definition.entranceAudioVolume,
    entranceAudioEnabled: definition.entranceAudioEnabled,
    keywords: [...definition.keywords],
    tags: definition.tags ? [...definition.tags] : [],
    abilities: [...definition.abilities],
    isSilenced: false,
    isAbilityDisabled: false,
    isSilenceImmune: false,
    dodgeAvailable: definition.keywords.includes('DODGE'),
    dodgeCharges: definition.keywords.includes('DODGE') ? 1 : 0,
    isStunned: false,
    activeUsedThisTurn: false,
    isDirectDeployedChampion: false,
    capturedCards: [],
  };
}

export function generateCard(
  definition: CardDefinition,
  options: GenerateCardWithEventOptions,
): { card: CardInstance; event: GameEvent } {
  const card = generateCardInstance(definition, { ...options, isGenerated: true });

  return {
    card,
    event: {
      type: 'CARD_GENERATED',
      playerId: options.playerId,
      cardInstanceId: card.instanceId,
      cardType: card.cardType,
      source: options.source ?? { type: 'SYSTEM' },
      target: { type: 'CARD', cardInstanceId: card.instanceId },
      reason: options.reason ?? 'CARD_EFFECT',
      sourceContext: options.sourceContext,
    },
  };
}

export function getRandomCardGenerationCandidates(
  definitions: readonly CardDefinition[],
  options: RandomCardPoolOptions = {},
): CardDefinition[] {
  const randomScope = options.randomScope ?? 'STANDARD';
  return definitions.filter((definition) => {
    if (options.cardType && definition.cardType !== options.cardType) return false;
    if (options.filter?.minCost !== undefined && definition.cost < options.filter.minCost) return false;
    if (options.filter?.isGenerated !== undefined && options.filter.isGenerated !== false) {
      // Definitions are not instances. Generated is a runtime property, so a
      // generated-only pool cannot be built from card definitions.
      return false;
    }
    if (options.filter?.isToken !== undefined && definition.isToken !== options.filter.isToken) return false;
    if (options.filter?.isChampionToken !== undefined && definition.isChampionToken !== options.filter.isChampionToken) return false;
    if (options.filter?.tags?.some((tag) => !(definition.tags ?? []).includes(tag))) return false;
    return isEligibleForRandomPool(definition, randomScope);
  });
}