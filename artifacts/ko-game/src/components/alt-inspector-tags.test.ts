import assert from 'node:assert/strict';
import test from 'node:test';
import { generateCardInstance } from '../game/cards/generation';
import { getCardInspectorMetadata } from './alt-inspector-utils';

test('상세창은 원래 태그와 효과로 얻은 태그를 함께 표시한다', () => {
  const card = generateCardInstance({ id: 'inspector-tag-test', name: '테스트', cardType: 'WRESTLER', rarity: 'NORMAL', cost: 2, attack: 2, health: 5, rulesText: '', tags: ['레이디', '악마', '언데드'], keywords: [], abilities: [] }, { instanceId: 'tag-instance' });
  card.grantedTags = ['실험체', '악마'];
  assert.deepEqual(getCardInspectorMetadata(card).tags, ['레이디', '악마', '언데드', '실험체']);
  assert.deepEqual(card.tags, ['레이디', '악마', '언데드']);
});
