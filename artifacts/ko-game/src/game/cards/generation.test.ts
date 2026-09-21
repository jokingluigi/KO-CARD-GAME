import assert from 'node:assert/strict';
import test from 'node:test';

import type { CardDefinition } from './types';
import {
  generateCard,
  generateCardInstance,
  getRandomCardGenerationCandidates,
} from './generation';
import { createTestDeck } from './test-cards';

function definition(
  id: string,
  isToken = false,
  isChampionToken = false,
): CardDefinition {
  return {
    id,
    name: id,
    cost: 1,
    attack: 1,
    health: 1,
    rulesText: '',
    isToken,
    isChampionToken,
    keywords: [],
    abilities: [],
  };
}

test('시작 덱 카드는 생성 카드가 아니다', () => {
  assert.equal(createTestDeck('player-1').every((card) => !card.isGenerated), true);
});

test('생성 카드는 isGenerated가 true이고 CARD_GENERATED 이벤트를 만든다', () => {
  const { card, event } = generateCard(definition('normal'), {
    instanceId: 'generated-1',
    playerId: 'player-1',
    source: { type: 'CARD', cardInstanceId: 'source-card' },
    reason: 'TEST_GENERATION',
  });

  assert.equal(card.isGenerated, true);
  assert.equal(card.isChampionToken, false);
  assert.equal(event.type, 'CARD_GENERATED');
  assert.deepEqual(event.source, {
    type: 'CARD',
    cardInstanceId: 'source-card',
  });
});

test('일반 토큰과 챔피언 토큰을 따로 관리한다', () => {
  const token = generateCardInstance(definition('token', true, false), {
    instanceId: 'token-1',
  });
  const championToken = generateCardInstance(
    definition('champion-token', true, true),
    { instanceId: 'champion-token-1' },
  );

  assert.equal(token.isToken, true);
  assert.equal(token.isChampionToken, false);
  assert.equal(championToken.isToken, true);
  assert.equal(championToken.isChampionToken, true);
  assert.equal(championToken.isDirectDeployedChampion, false);
});

test('일반 인스턴스 생성은 기본적으로 기존 카드 인스턴스로 남는다', () => {
  const card = generateCardInstance(definition('normal'), {
    instanceId: 'champion-ability-generated',
  });

  assert.equal(card.isGenerated, false);
  assert.equal(card.isChampionToken, false);
  assert.equal(card.isDirectDeployedChampion, false);
});

test('기본 비용 0인 generated/token 카드는 0G를 유지한다', () => {
  const card = generateCardInstance(
    { ...definition('zero-cost-token', true), cost: 0 },
    { instanceId: 'zero-cost-token-instance', isGenerated: true },
  );

  assert.equal(card.isGenerated, true);
  assert.equal(card.isToken, true);
  assert.equal(card.currentCost, 0);
});

test('generatedModifiers.cost가 0이면 generated 카드도 0G가 된다', () => {
  const { card } = generateCard({ ...definition('zero-modifier'), cost: 0 }, {
    instanceId: 'zero-modifier-instance',
    playerId: 'player-1',
    source: { type: 'CARD', cardInstanceId: 'source-card' },
    reason: 'TEST_GENERATION',
    statModifiers: { cost: 0 },
  });

  assert.equal(card.isGenerated, true);
  assert.equal(card.currentCost, 0);
});

test('음수 비용 보정은 0G 아래로 내려가지 않는다', () => {
  const { card } = generateCard(
    { ...definition('negative-modifier'), cost: 1 },
    {
      instanceId: 'negative-modifier-instance',
      playerId: 'player-1',
      source: { type: 'CARD', cardInstanceId: 'source-card' },
      reason: 'TEST_GENERATION',
      statModifiers: { cost: -2 },
    },
  );

  assert.equal(card.currentCost, 0);
});

test('표준 무작위 카드 생성 후보에서는 일반 토큰과 챔피언 토큰을 제외한다', () => {
  const normal = definition('normal');
  const token = definition('token', true, false);
  const championToken = definition('champion-token', true, true);
  const candidates = getRandomCardGenerationCandidates([
    normal,
    token,
    championToken,
  ]);

  assert.deepEqual(
    candidates.map((card) => card.id),
    ['normal'],
  );
});

test('완전히 무작위 카드 생성 후보에서는 토큰과 챔피언 토큰을 허용한다', () => {
  const candidates = getRandomCardGenerationCandidates([
    definition('normal'),
    definition('token', true, false),
    definition('champion-token', true, true),
  ], { randomScope: 'FULL' });

  assert.deepEqual(
    candidates.map((card) => card.id),
    ['normal', 'token', 'champion-token'],
  );
});

test('무작위 생성 Pool은 카드 타입 필터와 randomScope를 함께 적용한다', () => {
  const technique = { ...definition('technique'), cardType: 'TECHNIQUE' as const };
  const techniqueToken = { ...technique, id: 'technique-token', isToken: true };

  assert.deepEqual(
    getRandomCardGenerationCandidates(
      [definition('wrestler'), technique, techniqueToken],
      { cardType: 'TECHNIQUE', randomScope: 'STANDARD' },
    ).map((card) => card.id),
    ['technique'],
  );
  assert.deepEqual(
    getRandomCardGenerationCandidates(
      [definition('wrestler'), technique, techniqueToken],
      { cardType: 'TECHNIQUE', randomScope: 'FULL' },
    ).map((card) => card.id),
    ['technique', 'technique-token'],
  );
});

test('무작위 생성 Pool은 최소 코스트 필터를 적용한다', () => {
  assert.deepEqual(
    getRandomCardGenerationCandidates(
      [definition('low-cost'), { ...definition('high-cost'), cost: 3 }],
      { filter: { minCost: 3 } },
    ).map((card) => card.id),
    ['high-cost'],
  );
});

test('무작위 생성 Pool은 CardDefinition 태그 필터를 적용하고 토큰 태그를 유지한다', () => {
  const taggedToken = { ...definition('tagged-token', true), tags: ['용병'] };
  const untaggedToken = { ...definition('untagged-token', true), tags: [] };
  assert.deepEqual(
    getRandomCardGenerationCandidates(
      [taggedToken, untaggedToken],
      { randomScope: 'FULL', filter: { tagsAny: ['용병'] } },
    ).map((card) => card.id),
    ['tagged-token'],
  );
  assert.deepEqual(generateCardInstance(taggedToken, { instanceId: 'tagged-token-instance' }).tags, ['용병']);
});