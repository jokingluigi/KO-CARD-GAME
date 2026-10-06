import assert from 'node:assert/strict';
import test from 'node:test';
import { generateCard } from '../cards/generation';
import type { CardDefinition, CardEffect } from '../cards/types';
import { createInitialGameState } from './create-initial-game-state';
import { applyEffect, resolveStateBasedDeaths } from '../effects/effect-engine';
import { attack } from './combat';
import { destroyCard } from './destroy-card';
import { silenceCard } from './card-status';
import { endTurn } from './turn-system';
import { analyzeEffectText } from '../../../../api-server/src/lib/structured-effects';
import { sanitizeGameStateForViewer } from '../../../../api-server/src/online/sanitizer';

function fixture(owner = 'player-2') {
  const definition: CardDefinition = {id:'wanted',name:'wanted',cardType:'WRESTLER',cost:1,attack:3,health:3,rulesText:'수배',keywords:['WANTED'],abilities:[],isToken:false,isChampionToken:false};
  const wanted = generateCard(definition,{instanceId:'wanted',playerId:owner}).card;
  const source = generateCard({...definition,id:'source',keywords:[]},{instanceId:'source',playerId:owner==='player-1'?'player-2':'player-1'}).card;
  const initial = createInitialGameState();
  const state = {...initial,status:'IN_PROGRESS' as const,turn:1,activePlayerId:owner==='player-1'?'player-2':'player-1',players:initial.players.map(p=>({...p,currentGold:4,personalTurn:6,board:[{...(p.id===owner?wanted:source),boardSlot:0 as const},null,null,null] as typeof p.board}))};
  return {state,source,wanted,sourceOwner:owner==='player-1'?'player-2':'player-1'};
}
function effect(action: string, amount = 3, owner = 'ENEMY'): CardEffect {
  return {type:'STRUCTURED',action,target:{zone:'BOARD',owner,cardType:'WRESTLER',selection:'TOP',count:1},values:{amount}} as CardEffect;
}
for (const owner of ['player-1','player-2']) {
  for (const action of ['RETIRE','DESTROY','DAMAGE']) test(`${owner}: opponent ${action} queues exactly one gold`,()=>{
    const {state,source,wanted,sourceOwner} = fixture(owner);
    const next=applyEffect(state,sourceOwner,source,effect(action));
    const winner=next.players.find(p=>p.id===sourceOwner)!;
    assert.equal(winner.nextTurnGoldBonus,1);
    assert.equal(winner.currentGold,4);
    assert.equal(next.players.find(p=>p.id===owner)!.board[0],null);
    if(action==='DESTROY') assert.equal(next.players.find(p=>p.id===owner)!.graveyard.length,0);
    const retry=destroyCard(next,owner,wanted.instanceId,{sourcePlayerId:sourceOwner});
    assert.equal(retry.success,false);
    assert.equal(retry.state.players.find(p=>p.id===sourceOwner)!.nextTurnGoldBonus,1);
  });
}
for(const action of ['RETIRE','DESTROY','DAMAGE']) test(`own ${action} grants no bounty`,()=>{
  const {state,wanted}=fixture();
  const next=applyEffect(state,'player-2',wanted,effect(action,3,'SELF'));
  assert.deepEqual(next.players.map(p=>p.nextTurnGoldBonus),[0,0]);
});
test('nonlethal damage and silence grant no bounty',()=>{
  const {state,source,sourceOwner}=fixture();
  assert.equal(applyEffect(state,sourceOwner,source,effect('DAMAGE',1)).players[0].nextTurnGoldBonus,0);
  assert.equal(applyEffect(silenceCard(state,'wanted'),sourceOwner,source,effect('RETIRE')).players[0].nextTurnGoldBonus,0);
});
test('simultaneous combat deaths attribute attack and retaliation separately',()=>{
  const {state}=fixture();
  state.players[0].board[0]!.keywords=['WANTED'];
  const result=attack(state,'player-1','source',{type:'WRESTLER',playerId:'player-2',cardInstanceId:'wanted'});
  assert.equal(result.success,true);
  assert.deepEqual(result.state.players.map(p=>p.nextTurnGoldBonus),[1,1]);
});
test('reward survives reconnect, stacks, pays only on next own turn above gold cap and resets',()=>{
  const {state,source,sourceOwner}=fixture();
  state.players[0].nextTurnGoldBonus=2;
  let next=applyEffect(state,sourceOwner,source,effect('DESTROY'));
  next=JSON.parse(JSON.stringify(next));
  next=endTurn(next,'player-1').state;
  assert.equal(next.players[0].nextTurnGoldBonus,3);
  next=endTurn(next,'player-2').state;
  assert.equal(next.players[0].currentGold,9);
  assert.equal(next.players[0].nextTurnGoldBonus,0);
  next=endTurn(next,'player-1').state;
  next=endTurn(next,'player-2').state;
  assert.equal(next.players[0].currentGold,6);
});
test('text analyzer supports wanted keyword and preserves unsupported remainder',()=>{
  assert.deepEqual(analyzeEffectText('수배').keywords,['WANTED']);
  assert.equal(analyzeEffectText('수배').status,'success');
  assert.deepEqual(analyzeEffectText('수배\n불명확한 효과').keywords,['WANTED']);
  assert.notEqual(analyzeEffectText('수배\n불명확한 효과').status,'success');
});
test('multiple wanted cards stack one reward each and synchronize both PvP views',()=>{
  const {state,source,sourceOwner}=fixture();
  state.players[1].board[1]={...state.players[1].board[0]!,instanceId:'wanted-2',boardSlot:1};
  const mass={...effect('RETIRE'),target:{zone:'BOARD',owner:'ENEMY',cardType:'WRESTLER',selection:'ALL'}} as CardEffect;
  const next=applyEffect(state,sourceOwner,source,mass);
  assert.equal(next.players[0].nextTurnGoldBonus,2);
  for(const viewer of ['player-1','player-2']) assert.equal(sanitizeGameStateForViewer(next,viewer).players[0].nextTurnGoldBonus,2);
});
test('non-retire field removal awards nothing',()=>{
  const {state,source,sourceOwner}=fixture();
  const next=applyEffect(state,sourceOwner,source,effect('REMOVE_FROM_GAME'));
  assert.equal(next.players[1].board[0],null);
  assert.equal(next.players[0].nextTurnGoldBonus,0);
});
test('prevented retirement awards nothing',()=>{
  const {state,source,sourceOwner}=fixture();
  state.preventedRetireTargetIds=['wanted'];
  state.players[1].board[0]!.currentHealth=0;
  const next=resolveStateBasedDeaths(state,undefined,undefined,sourceOwner);
  assert.equal(next.players[0].nextTurnGoldBonus,0);
  assert.ok(next.players[1].board[0]);
});
