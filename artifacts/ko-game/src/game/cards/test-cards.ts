import type { CardDefinition, CardInstance } from './types';

export const TEST_CARD_DEFINITIONS: CardDefinition[] = [
  { id: 'test-wrestler-1', name: '테스트 선수 1', cost: 1, attack: 1, health: 2, rulesText: '' },
  { id: 'test-wrestler-2', name: '테스트 선수 2', cost: 2, attack: 2, health: 3, rulesText: '' },
  { id: 'test-wrestler-3', name: '테스트 선수 3', cost: 3, attack: 3, health: 4, rulesText: '' },
  { id: 'test-wrestler-4', name: '테스트 선수 4', cost: 4, attack: 4, health: 5, rulesText: '' },
  { id: 'test-wrestler-5', name: '테스트 선수 5', cost: 5, attack: 5, health: 6, rulesText: '' },
  { id: 'test-wrestler-6', name: '테스트 선수 6', cost: 6, attack: 6, health: 7, rulesText: '' },
];

export function getCardDefinition(
  definitionId: string,
): CardDefinition | undefined {
  return TEST_CARD_DEFINITIONS.find((card) => card.id === definitionId);
}

export function createTestDeck(playerId: string): CardInstance[] {
  return Array.from({ length: 20 }, (_, index) => {
    const definition = TEST_CARD_DEFINITIONS[index % TEST_CARD_DEFINITIONS.length];

    return {
      instanceId: `${playerId}-card-${index + 1}`,
      definitionId: definition.id,
    };
  });
}