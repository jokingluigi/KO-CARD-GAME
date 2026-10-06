import { generateCardInstance } from './generation';
import type { CardDefinition, CardInstance } from './types';

export const TEST_CARD_DEFINITIONS: CardDefinition[] = [
  {
    id: 'test-wrestler-1', name: '테스트 선수 1', cost: 1, attack: 1, health: 2,
    rulesText: '액티브: 골드를 1 얻습니다.', isToken: false, isChampionToken: false,
    keywords: [], abilities: [{ trigger: 'ACTIVE', effects: [{ type: 'GAIN_GOLD', amount: 1 }] }],
  },
  {
    id: 'test-wrestler-2', name: '테스트 선수 2', cost: 2, attack: 2, health: 3,
    rulesText: '러쉬', isToken: false, isChampionToken: false,
    keywords: ['RUSH'], abilities: [],
  },
  {
    id: 'test-wrestler-3', name: '테스트 선수 3', cost: 3, attack: 3, health: 4,
    rulesText: '기습', isToken: false, isChampionToken: false,
    keywords: ['SURPRISE'], abilities: [],
  },
  {
    id: 'test-wrestler-4', name: '테스트 선수 4', cost: 4, attack: 4, health: 5,
    rulesText: '도발', isToken: false, isChampionToken: false,
    keywords: ['TAUNT'], abilities: [],
  },
  {
    id: 'test-wrestler-5', name: '테스트 선수 5', cost: 5, attack: 5, health: 6,
    rulesText: '회피', isToken: false, isChampionToken: false,
    keywords: ['DODGE'], abilities: [],
  },
  {
    id: 'test-wrestler-6', name: '테스트 선수 6', cost: 6, attack: 6, health: 7,
    rulesText: '연타', isToken: false, isChampionToken: false,
    keywords: ['MULTI_STRIKE'], abilities: [],
  },
];

export const KEYWORD_TEST_CARD_DEFINITIONS: CardDefinition[] = [
  { id: 'test-rush', name: '테스트 러쉬', cost: 1, attack: 1, health: 2, rulesText: '러쉬', isToken: false, isChampionToken: false, keywords: ['RUSH'], abilities: [] },
  { id: 'test-surprise', name: '테스트 기습', cost: 1, attack: 1, health: 2, rulesText: '기습', isToken: false, isChampionToken: false, keywords: ['SURPRISE'], abilities: [] },
  { id: 'test-taunt-dodge', name: '테스트 도발 회피', cost: 1, attack: 1, health: 2, rulesText: '도발, 회피', isToken: false, isChampionToken: false, keywords: ['TAUNT', 'DODGE'], abilities: [] },
  { id: 'test-multi', name: '테스트 연타', cost: 1, attack: 1, health: 2, rulesText: '연타', isToken: false, isChampionToken: false, keywords: ['MULTI_STRIKE'], abilities: [] },
  {
    id: 'test-trigger-active',
    name: '테스트 능력',
    cost: 1,
    attack: 1,
    health: 2,
    rulesText: '등장, 퇴장, 포지션, 액티브',
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [
      { trigger: 'ENTER_FIELD', effects: [{ type: 'GAIN_GOLD', amount: 1 }] },
      { trigger: 'LEAVE_FIELD', reasons: ['RETIRE'], effects: [{ type: 'GAIN_GOLD', amount: 1 }] },
      { trigger: 'POSITION', boardSlots: [0], effects: [{ type: 'MODIFY_SELF_ATTACK', amount: 1 }] },
      { trigger: 'ACTIVE', effects: [{ type: 'GAIN_GOLD', amount: 1 }] },
    ],
  },
];

export const TEST_CHAMPION_TOKEN_DEFINITION: CardDefinition = {
  id: 'test-champion-token',
  name: '테스트 챔피언 토큰',
  cost: 0,
  attack: 2,
  health: 20,
  rulesText: '챔피언 직접 출전 테스트 토큰',
  isToken: true,
  isChampionToken: true,
  keywords: [],
  abilities: [],
};

export const TRAINING_DUMMY_DEFINITIONS: CardDefinition[] = [
  { id: 'admin-training-dummy-immortal', name: '안 죽는 샌드백', cardType: 'WRESTLER', cost: 0, attack: 0, health: 1, rulesText: '관리자 테스트 전용 · 피해를 받아도 필드에 남습니다.', rarity: 'NORMAL', isToken: true, isChampionToken: false, keywords: [], abilities: [] },
  { id: 'admin-training-dummy-one-hp', name: '체력 1 샌드백', cardType: 'WRESTLER', cost: 0, attack: 0, health: 1, rulesText: '관리자 테스트 전용 · 체력 1', rarity: 'NORMAL', isToken: true, isChampionToken: false, keywords: [], abilities: [] },
];

let runtimeCardDefinitions: CardDefinition[] = [];

export function setRuntimeCardDefinitions(
  definitions: CardDefinition[],
): void {
  runtimeCardDefinitions = definitions;
}

export function getCardDefinition(
  definitionId: string,
): CardDefinition | undefined {
  return [
    ...runtimeCardDefinitions,
    ...TEST_CARD_DEFINITIONS,
    ...KEYWORD_TEST_CARD_DEFINITIONS,
    TEST_CHAMPION_TOKEN_DEFINITION,
    ...TRAINING_DUMMY_DEFINITIONS,
  ].find((card) => card.id === definitionId);
}

export function createTestDeck(
  playerId: string,
  definitions: readonly CardDefinition[] = TEST_CARD_DEFINITIONS,
): CardInstance[] {
  const deckDefinitions = definitions.length
    ? definitions
    : TEST_CARD_DEFINITIONS;

  return Array.from({ length: 25 }, (_, index) => {
    const definition = deckDefinitions[index % deckDefinitions.length];

    return generateCardInstance(definition, { instanceId: `${playerId}-card-${index + 1}`, isGenerated: false });
  });
}

export function createDeckFromDefinitionIds(
  playerId: string,
  definitionIds: readonly string[],
  definitions: readonly CardDefinition[],
): CardInstance[] {
  return definitionIds.flatMap((definitionId, index) => {
    const definition = definitions.find((candidate) => candidate.id === definitionId);
    if (!definition) {
      throw new Error(`덱에 필요한 CardDefinition을 찾을 수 없습니다: ${definitionId}`);
    }
    return [generateCardInstance(definition, { instanceId: `${playerId}-card-${index + 1}`, isGenerated: false })];
  });
}

export function getCardDefinitions(): CardDefinition[] {
  return [...new Map([...runtimeCardDefinitions, ...TEST_CARD_DEFINITIONS, ...KEYWORD_TEST_CARD_DEFINITIONS, TEST_CHAMPION_TOKEN_DEFINITION].map(card => [card.id, card])).values()];
}
