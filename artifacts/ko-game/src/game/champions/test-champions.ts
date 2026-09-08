import type {
  ChampionDefinition,
  ChampionState,
} from './types';

export const TEST_CHAMPIONS: ChampionDefinition[] = [
  {
    id: 'test-champion-quest',
    name: '테스트 챔피언',
    maxHealth: 20,
    abilityCost: 1,
    ability: {
      id: 'test-gain-gold',
      name: '테스트 지원',
      description: '골드를 1 얻습니다.',
      effects: [{ type: 'GAIN_GOLD', amount: 1 }],
    },
    quest: {
      id: 'test-play-cards',
      name: '테스트 퀘스트',
      description: '카드를 2장 사용하세요.',
      trackedEvent: 'CARD_PLAYED',
      requiredProgress: 2,
      reward: { type: 'UPGRADE_ABILITY' },
    },
    upgradedAbility: {
      id: 'test-gain-gold-upgraded',
      name: '강화된 테스트 지원',
      description: '골드를 2 얻습니다.',
      effects: [{ type: 'GAIN_GOLD', amount: 2 }],
    },
  },
  {
    id: 'test-champion-no-quest',
    name: '퀘스트 없는 챔피언',
    maxHealth: 20,
    abilityCost: 1,
    ability: {
      id: 'test-heal',
      name: '테스트 회복',
      description: '챔피언 체력을 1 회복합니다.',
      effects: [{ type: 'HEAL_CHAMPION', amount: 1 }],
    },
    quest: null,
    upgradedAbility: null,
  },
  {
    id: 'test-champion-direct-deploy',
    name: '직접 출전 테스트 챔피언',
    maxHealth: 20,
    abilityCost: 1,
    ability: {
      id: 'test-direct-deploy',
      name: '직접 출전',
      description: '테스트 챔피언 토큰으로 직접 출전합니다.',
      effects: [
        {
          type: 'DIRECT_DEPLOY_CHAMPION_TOKEN',
          cardDefinitionId: 'test-champion-token',
        },
      ],
    },
    quest: null,
    upgradedAbility: null,
  },
];

export function createChampionState(
  championId: string,
  definitions: readonly ChampionDefinition[] = TEST_CHAMPIONS,
): ChampionState {
  const definition = definitions.find(
    (candidate) => candidate.id === championId,
  );
  if (!definition) {
    throw new Error(`챔피언 정의를 찾을 수 없습니다: ${championId}`);
  }

  return {
    ...definition,
    health: definition.maxHealth,
    questProgress: 0,
    questCompleted: false,
  };
}