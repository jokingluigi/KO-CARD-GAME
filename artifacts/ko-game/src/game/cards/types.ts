export type CardDefinitionId = string;
export type CardInstanceId = string;

export interface CardDefinition {
  id: CardDefinitionId;
  name: string;
  cost: number;
  attack: number;
  health: number;
  rulesText: string;
  isToken: boolean;
  isChampionToken: boolean;
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
}