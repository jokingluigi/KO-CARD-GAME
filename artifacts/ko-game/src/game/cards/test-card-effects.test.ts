import assert from 'node:assert/strict';
import test from 'node:test';

import { getActiveAbility } from '../effects/effect-engine';
import { createTestDeck, TEST_CARD_DEFINITIONS } from './test-cards';

test('시작 덱의 테스트 선수 종류마다 효과가 하나씩 배정된다', () => {
  assert.deepEqual(
    TEST_CARD_DEFINITIONS.map((card) => ({
      id: card.id,
      keywords: card.keywords,
      hasActive: getActiveAbility(createTestDeck('test').find(
        (instance) => instance.definitionId === card.id,
      )!) !== undefined,
    })),
    [
      { id: 'test-wrestler-1', keywords: [], hasActive: true },
      { id: 'test-wrestler-2', keywords: ['RUSH'], hasActive: false },
      { id: 'test-wrestler-3', keywords: ['SURPRISE'], hasActive: false },
      { id: 'test-wrestler-4', keywords: ['TAUNT'], hasActive: false },
      { id: 'test-wrestler-5', keywords: ['DODGE'], hasActive: false },
      { id: 'test-wrestler-6', keywords: ['MULTI_STRIKE'], hasActive: false },
    ],
  );
});