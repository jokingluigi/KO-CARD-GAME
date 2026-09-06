export type CardDefinitionId = string;
export type CardInstanceId = string;

export interface CardDefinition {
  id: CardDefinitionId;
  name: string;
  cost: number;
  rulesText: string;
}

export interface CardInstance {
  instanceId: CardInstanceId;
  definitionId: CardDefinitionId;
}