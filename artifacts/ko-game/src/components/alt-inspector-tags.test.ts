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

test('상세창은 네 번째 이후의 모든 기본 태그도 보존한다',()=>{
 const tags=['하나','둘','셋','넷','다섯','여섯'];const card=generateCardInstance({id:'many-inspector-tags',name:'선수',cardType:'WRESTLER',rarity:'NORMAL',cost:2,attack:2,health:5,rulesText:'',tags,keywords:[],abilities:[]},{instanceId:'many-tags'});
 card.grantedTags=['추가','둘'];assert.deepEqual(getCardInspectorMetadata(card).tags,[...tags,'추가']);assert.deepEqual(card.tags,tags);
});
