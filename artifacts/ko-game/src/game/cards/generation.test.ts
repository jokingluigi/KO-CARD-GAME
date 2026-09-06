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

test('생성 출처만으로 챔피언 토큰이 되지 않는다', () => {
  const card = generateCardInstance(definition('normal'), {
    instanceId: 'champion-ability-generated',
  });

  assert.equal(card.isGenerated, true);
  assert.equal(card.isChampionToken, false);
  assert.equal(card.isDirectDeployedChampion, false);
});

test('무작위 카드 생성 후보에서 챔피언 토큰을 항상 제외한다', () => {
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
    ['normal', 'token'],
  );
});