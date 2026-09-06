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
  isToken: boolean;
  isChampionToken: boolean;
  keywords: CardKeyword[];
  abilities: CardAbility[];
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
  currentCost: number;
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
  isStunned: boolean;
  activeUsedThisTurn: boolean;
  isDirectDeployedChampion: boolean;
}