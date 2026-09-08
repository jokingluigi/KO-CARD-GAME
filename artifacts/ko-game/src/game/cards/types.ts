import type { CardAbility, CardKeyword } from '../effects/types';

export type CardDefinitionId = string;
export type CardInstanceId = string;

export interface CardDefinition {
  id: CardDefinitionId;
  name: string;
  cardType?: 'WRESTLER' | 'TECHNIQUE';
  cost: number;
  attack: number;
  health: number;
  rulesText: string;
  imageAssetId?: string | null;
  imageUrl?: string | null;
  isToken: boolean;
  isChampionToken: boolean;
  keywords: CardKeyword[];
  abilities: CardAbility[];
  /** Tags are independent of generated status and may be shared by many cards. */
  tags?: string[];
  status?: 'DRAFT' | 'PUBLISHED' | 'DISABLED';
  version?: number;
  effectId?: string | null;
  effectConfig?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CardInstance {
  instanceId: CardInstanceId;
  definitionId: CardDefinitionId;
  cardType?: 'WRESTLER' | 'TECHNIQUE';
  currentCost: number;
  /** Immutable values copied from the definition, retained for runtime checks. */
  baseCost?: number;
  baseAttack?: number;
  baseHealth?: number;
  currentAttack: number;
  currentHealth: number;
  maxHealth: number;
  boardSlot: 0 | 1 | 2 | 3 | null;
  enteredThisTurn: boolean;
  attacksUsedThisTurn: number;
  isGenerated: boolean;
  isToken: boolean;
  isChampionToken: boolean;
  keywords: CardKeyword[];
  abilities: CardAbility[];
  isSilenced: boolean;
  isSilenceImmune: boolean;
  dodgeAvailable: boolean;
  /** Counted dodge is backward compatible with the original boolean flag. */
  dodgeCharges?: number;
  isStunned: boolean;
  activeUsedThisTurn: boolean;
  isDirectDeployedChampion: boolean;
  tags?: string[];
  /** Serializable base copies held by this card's CAPTURE action. */
  capturedCards?: CapturedCard[];
}

export interface CapturedCard {
  definitionId: CardDefinitionId;
  baseSnapshot: Pick<CardInstance, 'definitionId' | 'cardType' | 'currentCost' | 'currentAttack' | 'currentHealth' | 'maxHealth' | 'isGenerated' | 'isToken' | 'isChampionToken' | 'keywords' | 'abilities' | 'tags' | 'dodgeCharges'>;
}