import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { generateCardInstance, getRandomCardGenerationCandidates } from '../cards/generation';
import { completeMinionACatalog } from '../champions/minion-a';
import type { CardDefinition } from '../cards/types';
import type { CardEffect } from './types';
import { applyEffect, getValidTargets } from './effect-engine';

const definition = (id: string, extra: Partial<CardDefinition> = {}): CardDefinition => ({
  id, name: id, cardType: 'WRESTLER', cost: 2, attack: 2, health: 3, rulesText: '',
  status: 'PUBLISHED', isToken: false, isChampionToken: false, keywords: [], abilities: [], ...extra,
});
const catalog = [definition('public'), definition('draft', {status: 'DRAFT'}),
  definition('disabled', {status: 'DISABLED'}), definition('token', {isToken: true}),
  definition('champion-token', {isToken: true, isChampionToken: true})];
const source = generateCardInstance(definition('source'), {instanceId:'source'});
function fixture(pool = catalog) {
  const state = createInitialGameState(undefined, [catalog[0]!], undefined, undefined, {minionACardPool:pool, randomSeed:1});
  for(const player of state.players) {player.hand=[]; player.board=[null,null,null,null];}
  state.status='IN_PROGRESS'; state.activePlayerId='player-1'; state.turn=1;
  return state;
}
const randomEffect = (scope: 'STANDARD'|'FULL', action: 'GENERATE'|'SUMMON' = 'GENERATE'): CardEffect => ({
  type:'STRUCTURED', action, target:{zone:action==='GENERATE'?'HAND':'BOARD', owner:'SELF', selection:'RANDOM', count:20, randomScope:scope},
});

test('STANDARD filters publication and both token kinds; FULL includes all valid categories', () => {
  assert.deepEqual(getRandomCardGenerationCandidates(catalog).map(d=>d.id), ['public']);
  assert.deepEqual(getRandomCardGenerationCandidates(catalog,{randomScope:'FULL'}).map(d=>d.id), catalog.map(d=>d.id));
});

test('ordinary champions receive the full effect catalog without adding hidden cards to initial decks', () => {
  const state=fixture();
  assert.equal(state.minionACardPool,undefined);
  assert.deepEqual(state.cardPool?.map(d=>d.id),catalog.map(d=>d.id));
  assert.ok(state.players.every(p=>p.deck.every(c=>c.definitionId==='public')));
});

for(const scope of ['STANDARD','FULL'] as const) {
  test(`${scope} generation by an ordinary card uses the correct catalog after serialization`,()=>{
    const state=fixture();const before=JSON.stringify(catalog);
    const result=applyEffect(JSON.parse(JSON.stringify(state)),'player-1',source,randomEffect(scope));
    assert.deepEqual(result.players[0].hand.map(c=>c.definitionId).sort(),(scope==='FULL'?catalog.map(d=>d.id):['public']).sort());
    assert.equal(JSON.stringify(catalog),before);
    for(const card of result.players[0].hand) {
      assert.deepEqual([card.baseCost,card.baseAttack,card.baseHealth],[2,2,3]);
      assert.equal(card.status,catalog.find(d=>d.id===card.definitionId)?.status);
    }
  });

  test(`${scope} board target validation and execution use the same candidates, including legacy instances`,()=>{
    const state=fixture(); const definitions=catalog.filter(d=>d.id!=='disabled');
    state.players[1].board=definitions.map((d,i)=>({...generateCardInstance(d,{instanceId:d.id}),status:undefined,boardSlot:i as 0|1|2|3})) as typeof state.players[1]['board'];
    const effect:CardEffect={type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'ENEMY',selection:'RANDOM',count:20,randomScope:scope},values:{attack:1,health:0}};
    const expected=scope==='FULL'?definitions.map(d=>d.id):['public'];
    assert.deepEqual(getValidTargets(state,'player-1',source,effect).sort(),expected.sort());
    const result=applyEffect(state,'player-1',source,effect);
    assert.deepEqual(result.players[1].board.filter(c=>c?.currentAttack===3).map(c=>c!.definitionId).sort(),expected.sort());
  });

  test(`${scope} SCRIPT SELECT respects publication before sort/take, then applies the selected effect`,()=>{
    const state=fixture();state.players[0].hand=[catalog[1]!,catalog[0]!].map(d=>generateCardInstance(d,{instanceId:d.id}));
    const effect:CardEffect={type:'SCRIPT',script:{version:'SCRIPT_V1',trigger:'ENTER_FIELD',steps:[
      {type:'SELECT',id:'picked',target:{zone:'HAND',owner:'SELF',selection:'RANDOM',count:1,take:1,randomScope:scope}},
      {type:'EFFECT',effect:{action:'BUFF',target:{zone:'HAND',owner:'SELF',resultId:'picked'},values:{attack:1,health:0}}},
    ]}};
    const result=applyEffect(state,'player-1',source,effect);
    assert.equal(result.players[0].hand.find(c=>c.currentAttack===3)?.definitionId,scope==='FULL'?'draft':'public');
  });
}

for(const donor of catalog.slice(1)) for(const scope of ['STANDARD','FULL'] as const) {
  test(`${scope} random text donor eligibility: ${donor.id}`,()=>{
    const state=fixture([{...donor,keywords:['TAUNT']}]);
    state.players[0].board[0]={...generateCardInstance(definition('recipient'),{instanceId:'recipient'}),boardSlot:0};
    const effect:CardEffect={type:'STRUCTURED',action:'GRANT_RANDOM_CARD_TEXT',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1,randomScope:scope}};
    const result=applyEffect(state,'player-1',source,effect,['recipient']);
    assert.equal(result.players[0].board[0]?.grantedText?.donorDefinitionId,scope==='FULL'?donor.id:undefined);
  });
}

test('FULL random summon and adjacent summon include an unpublished champion token',()=>{
  const token=definition('hidden-champion-token',{status:'DISABLED',isToken:true,isChampionToken:true});
  const state=fixture([token]);
  state.cardPool=[token];
  const summoned=applyEffect(state,'player-1',source,randomEffect('FULL','SUMMON'));
  assert.equal(summoned.players[0].board[0]?.definitionId,token.id);
  state.players[0].board[1]={...source,boardSlot:1};
  const adjacent:CardEffect={type:'STRUCTURED',action:'SUMMON',target:{zone:'BOARD',owner:'SELF',selection:'ADJACENT_EMPTY_SLOTS',count:2,randomScope:'FULL'}};
  const result=applyEffect(state,'player-1',state.players[0].board[1]!,adjacent);
  assert.equal(result.players[0].board[0]?.definitionId,token.id);
  assert.equal(result.players[0].board[2]?.definitionId,token.id);
});

test('FULL still honors explicit card type, cost, tag and champion exclusion filters',()=>{
  const hidden=definition('hidden-technique',{status:'DRAFT',cardType:'TECHNIQUE',tags:['test']});
  const pool=[hidden,{...hidden,id:'champion',isToken:true,isChampionToken:true},{...hidden,id:'wrong-tag',tags:[]},{...hidden,id:'too-expensive',cost:3},definition('wrestler',{tags:['test']})];
  assert.deepEqual(getRandomCardGenerationCandidates(pool,{randomScope:'FULL',cardType:'TECHNIQUE',filter:{maxCost:2,tagsAny:['test'],isChampionToken:false}}).map(d=>d.id),['hidden-technique']);
});

test('SCRIPT text grants preserve FULL when applying a previously selected recipient',()=>{
  const donor={...catalog[1]!,keywords:['TAUNT' as const]};
  const state=fixture([donor]);
  state.players[0].board[0]={...generateCardInstance(definition('recipient'),{instanceId:'recipient'}),boardSlot:0};
  const effect:CardEffect={type:'SCRIPT',script:{version:'SCRIPT_V1',trigger:'ENTER_FIELD',steps:[
    {type:'SELECT',id:'recipient',target:{zone:'BOARD',owner:'SELF',selection:'ALL',count:1}},
    {type:'EFFECT',effect:{action:'GRANT_RANDOM_CARD_TEXT',target:{zone:'BOARD',owner:'SELF',resultId:'recipient',randomScope:'FULL'}}},
  ]}};
  const result=applyEffect(state,'player-1',source,effect);
  assert.equal(result.players[0].board[0]?.grantedText?.donorDefinitionId,'draft');
});

test('complete validated catalog contains published, draft, disabled and both token kinds',()=>{
  const records=catalog.map(d=>({...d,text:d.rulesText,effectId:null,effectConfig:{}}));
  const pool=completeMinionACatalog([...records,{...records[0],id:'deleted',deletedAt:'today'}]);
  assert.deepEqual(pool.filter(d=>d.id!=='ko-fallback-zombie-token').map(d=>d.id).sort(),catalog.map(d=>d.id).sort());
  assert.deepEqual(getRandomCardGenerationCandidates(pool).map(d=>d.id),['public']);
});
