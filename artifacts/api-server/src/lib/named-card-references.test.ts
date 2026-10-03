import test from 'node:test';
import assert from 'node:assert/strict';
import {expandNamedCardReferences} from './named-card-references';
const helper={id:'helper',name:'헬퍼',status:'DRAFT',effectId:null,effectConfig:{},text:"턴 시작:지난 턴에 아군 선수 카드와 챔피언이 자신의 최대 체력을 초과한 회복량의 총합이 5를 넘으면 '냥냥 펀치'를 손에 생성합니다."};
const token={id:'punch',name:'냥냥 펀치',status:'DRAFT',effectId:null,effectConfig:{},text:'등장:상대 선수와 상대 챔피언에게 5 데미지를 무작위로 나눠서 가합니다.'};
test('owned/unpublished Helfer includes its named token without exposing unrelated drafts',()=>{const ids=new Set(['helper']);expandNamedCardReferences([helper,token,{...token,id:'other',name:'미공개 다른 카드'}],ids);assert.deepEqual([...ids],['helper','punch']);});
test('unowned Helfer and disabled tokens are not exposed',()=>{let ids=new Set<string>();expandNamedCardReferences([helper,token],ids);assert.equal(ids.size,0);ids=new Set(['helper']);expandNamedCardReferences([helper,{...token,status:'DISABLED'}],ids);assert.deepEqual([...ids],['helper']);});
test('existing explicitly authored configurations retain their dependency policy',()=>{const ids=new Set(['helper']);expandNamedCardReferences([{...helper,effectId:'ACTIVE_GAIN_GOLD'},token],ids);assert.deepEqual([...ids],['helper']);});

const source = { id: 'maid', name: '하녀 판도라', status: 'DRAFT', effectConfig: {
  effects: [{ action: 'TRANSFORM_SOURCE', values: { definitionRef: { name: '늑대인간' } } }],
} };

test('older name-only transformation loads a unique DRAFT form used by an AI deck', () => {
  const required = new Set(['maid']);
  expandNamedCardReferences([source, { id: 'wolf', name: '늑대인간 판도라', status: 'DRAFT', effectConfig: {} }], required);
  assert.deepEqual([...required], ['maid', 'wolf']);
});

test('test matches include the referenced DRAFT form by id without putting it in the deck', () => {
  const required = new Set(['maid-id']);
  expandNamedCardReferences([
    { id: 'maid-id', name: '하녀 판도라', status: 'DRAFT', effectConfig: { effects: [{ action: 'TRANSFORM_SOURCE', values: { definitionRef: { id: 'form-id' } } }] } },
    { id: 'form-id', name: '늑대인간 판도라', status: 'DRAFT', effectConfig: {} },
  ], required);
  assert.deepEqual([...required], ['maid-id', 'form-id']);
});

test('ambiguous or disabled forms are never chosen by partial name', () => {
  const required = new Set(['maid']);
  expandNamedCardReferences([
    source,
    { id: 'wolf-a', name: '늑대인간 판도라', status: 'PUBLISHED', effectConfig: {} },
    { id: 'wolf-b', name: '늑대인간 블랙', status: 'DRAFT', effectConfig: {} },
  ], required);
  assert.deepEqual([...required], ['maid']);
  expandNamedCardReferences([
    source, { id: 'wolf', name: '늑대인간 판도라', status: 'DISABLED', effectConfig: {} },
  ], required);
  assert.deepEqual([...required], ['maid']);
});

test('Maid Pandora stale form id loads its unique canonical wolf form', () => {
 const required = new Set(['maid']);
 expandNamedCardReferences([{ ...source, effectConfig: { effects: [{ action: 'TRANSFORM_SOURCE', values: { definitionRef: { id: 'obsolete-id' } } }] } }, { id: 'wolf', name: '늑대인간 판도라', status: 'DRAFT', effectConfig: {} }], required);
 assert.deepEqual([...required], ['maid', 'wolf']);
});
