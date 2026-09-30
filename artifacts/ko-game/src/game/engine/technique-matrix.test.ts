import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState } from './create-initial-game-state';
import { generateCardInstance } from '../cards/generation';
import { executeAction } from '../actions/engine-actions';
import type { CardDefinition } from '../cards/types';
import type { CardEffect } from '../effects/types';
const unit:CardDefinition={id:'unit',name:'Unit',cardType:'WRESTLER',cost:1,attack:2,health:6,rulesText:'',isToken:false,isChampionToken:false,keywords:[],abilities:[]};
function setup(effects:CardEffect[],trigger:'ACTIVE'|'ENTER_FIELD'='ACTIVE') {
 const spell:CardDefinition={...unit,id:'spell',name:'Spell',cardType:'TECHNIQUE',cost:1,attack:0,health:0,abilities:[{trigger,effects}]};
 const s=createInitialGameState();s.status='IN_PROGRESS';s.activePlayerId='player-1';s.turn=3;s.cardPool=[unit,spell];s.players[0].currentGold=5;s.players[0].hand=[generateCardInstance(spell,{instanceId:'spell'})];
 s.players[0].board[0]={...generateCardInstance(unit,{instanceId:'ally'}),boardSlot:0,currentHealth:2};s.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),boardSlot:0};
 return s;
}
function play(s:ReturnType<typeof setup>){const r=executeAction(s,{type:'PLAY_TECHNIQUE',playerId:'player-1',cardInstanceId:'spell'});assert.equal(r.success,true);return r.state;}
const target=(owner:'SELF'|'ENEMY')=>({zone:'BOARD' as const,owner,selection:'ALL' as const,count:4});
for(const trigger of ['ACTIVE','ENTER_FIELD'] as const) {
 test(`${trigger} spell deals damage once and pays/removes exactly one card`,()=>{
  const s=play(setup([{type:'STRUCTURED',action:'DAMAGE',target:target('ENEMY'),values:{amount:3}}],trigger));
  assert.equal(s.players[1].board[0]!.currentHealth,3);assert.equal(s.players[0].currentGold,4);assert.equal(s.players[0].hand.length,0);assert.equal(s.players[0].graveyard.filter(c=>c.instanceId==='spell').length,1);assert.equal(executeAction(s,{type:'PLAY_TECHNIQUE',playerId:'player-1',cardInstanceId:'spell'}).success,false);
 });
}
test('heal caps at max HP and buff applies only to intended side',()=>{
 const s=play(setup([{type:'STRUCTURED',action:'HEAL',target:target('SELF'),values:{amount:9}},{type:'STRUCTURED',action:'BUFF',target:target('SELF'),values:{attack:2,health:1}}]));
 assert.equal(s.players[0].board[0]!.currentAttack,4);assert.equal(s.players[0].board[0]!.currentHealth,7);assert.equal(s.players[1].board[0]!.currentAttack,2);
});
test('destroy removes a card entirely, lethal damage retires to graveyard',()=>{
 const destroyed=play(setup([{type:'STRUCTURED',action:'DESTROY',target:target('ENEMY')}]));assert.equal(destroyed.players[1].board[0],null);assert.equal(destroyed.players[1].graveyard.length,0);
 const retired=play(setup([{type:'STRUCTURED',action:'DAMAGE',target:target('ENEMY'),values:{amount:6}}]));assert.equal(retired.players[1].board[0],null);assert.equal(retired.players[1].graveyard[0]!.instanceId,'enemy');
});
test('targeted spell precommit cancellation leaves hand, gold and health unchanged',()=>{
 const original=setup([{type:'STRUCTURED',action:'DAMAGE',target:{...target('ENEMY'),selection:'PLAYER_CHOICE',count:1},values:{amount:3}}]);
 const begin=executeAction(original,{type:'BEGIN_TARGETED_ACTION',playerId:'player-1',action:{type:'PLAY_TECHNIQUE',cardInstanceId:'spell'}});assert.equal(begin.success,true);assert.equal(begin.state.players[0].currentGold,5);
 const cancel=executeAction(begin.state,{type:'CANCEL_EFFECT_TARGET',playerId:'player-1'});assert.equal(cancel.success,true);assert.deepEqual(cancel.state,{...original,targetingState:undefined});
 const confirm=executeAction(begin.state,{type:'CONFIRM_PRECOMMIT_TARGET',playerId:'player-1',targetId:'enemy'});assert.equal(confirm.success,true);assert.equal(confirm.state.players[1].board[0]!.currentHealth,3);assert.equal(confirm.state.players[0].currentGold,4);
});
test('no valid target, wrong turn and insufficient gold reject without consuming a spell',()=>{
 const s=setup([{type:'STRUCTURED',action:'DAMAGE',target:{...target('ENEMY'),selection:'PLAYER_CHOICE',count:1},values:{amount:3}}]);s.players[1].board=[null,null,null,null];
 const r=executeAction(s,{type:'PLAY_TECHNIQUE',playerId:'player-1',cardInstanceId:'spell'});assert.equal(r.success,false);assert.deepEqual(r.state,s);
 s.players[1].board[0]={...generateCardInstance(unit,{instanceId:'enemy'}),boardSlot:0};s.players[0].currentGold=0;assert.equal(executeAction(s,{type:'PLAY_TECHNIQUE',playerId:'player-1',cardInstanceId:'spell'}).success,false);
 s.players[0].currentGold=5;s.activePlayerId='player-2';assert.equal(executeAction(s,{type:'PLAY_TECHNIQUE',playerId:'player-1',cardInstanceId:'spell'}).success,false);
});
test('next-spell reservation preserves its gold event and is consumed exactly once',()=>{
 const s=setup([]);s.pendingCardEffects=[{playerId:'player-1',sourceInstanceId:'other',trigger:'NEXT_TECHNIQUE_PLAYED',effect:{action:'ADD_GOLD',values:{amount:2}}}];
 const after=play(s);assert.equal(after.players[0].currentGold,6);assert.equal(after.pendingCardEffects!.length,0);assert.ok(after.events.some(e=>e.type==='GOLD_CHANGED'&&e.amount===2));
});

test('draw and summon spells execute in order and never place the technique itself on the field',()=>{
 const s=setup([{type:'STRUCTURED',action:'DRAW',values:{amount:1}},{type:'STRUCTURED',action:'SUMMON',values:{definition:unit,count:1}}]);
 s.players[0].deck=[generateCardInstance(unit,{instanceId:'drawn'})];
 const after=play(s);assert.ok(after.players[0].hand.some(c=>c.instanceId==='drawn'));assert.equal(after.players[0].board.filter(Boolean).length,2);assert.ok(after.players[0].board.every(c=>!c||c.cardType==='WRESTLER'));
});
test('spell damage can finish a match through an unprotected enemy champion',()=>{
 const s=setup([{type:'STRUCTURED',action:'DAMAGE',target:{zone:'CHARACTER',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:4}}]);s.players[1].health=3;if(s.players[1].champion)s.players[1].champion.health=3;
 const begin=executeAction(s,{type:'BEGIN_TARGETED_ACTION',playerId:'player-1',action:{type:'PLAY_TECHNIQUE',cardInstanceId:'spell'}});assert.equal(begin.success,true);
 const result=executeAction(begin.state,{type:'CONFIRM_PRECOMMIT_TARGET',playerId:'player-1',targetId:'player-2'});assert.equal(result.success,true);assert.equal(result.state.status,'FINISHED');assert.equal(result.state.winnerId,'player-1');
});
test('queued cost increases cannot create negative gold and failed casts preserve the reservation',()=>{
 const s=setup([]);s.pendingCardEffects=[{playerId:'player-1',sourceInstanceId:'other',trigger:'NEXT_TECHNIQUE_PLAYED',effect:{action:'INCREASE_COST',values:{amount:9}}}];
 const result=executeAction(s,{type:'PLAY_TECHNIQUE',playerId:'player-1',cardInstanceId:'spell'});
 assert.equal(result.success,false);assert.deepEqual(result.state,s);
});

test('queued cost reduction permits a spell affordable only after its reservation',()=>{
 const s=setup([]);s.players[0].currentGold=0;s.pendingCardEffects=[{playerId:'player-1',sourceInstanceId:'other',trigger:'NEXT_TECHNIQUE_PLAYED',effect:{action:'REDUCE_COST',values:{amount:1}}}];
 const result=executeAction(s,{type:'PLAY_TECHNIQUE',playerId:'player-1',cardInstanceId:'spell'});assert.equal(result.success,true);assert.equal(result.state.players[0].currentGold,0);assert.equal(result.state.pendingCardEffects!.length,0);
});
