import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChampionQuestCondition, validChampionQuestCondition } from './champion-quest-conditions';
import { createInitialGameState } from './index';
const state = () => ({...createInitialGameState(),turn:9});
test('turn and health thresholds use current match state and distinguish players',()=>{
 const s=state();s.players[0]!.health=10;s.players[1]!.health=20;
 assert.equal(evaluateChampionQuestCondition({type:'TURN',turn:5},s,s.players[0]!.id,[]).completed,true);
 assert.equal(evaluateChampionQuestCondition({type:'TURN',turn:6},s,s.players[0]!.id,[]).completed,false);
 assert.equal(evaluateChampionQuestCondition({type:'HEALTH',owner:'SELF',op:'LTE',value:10},s,s.players[0]!.id,[]).completed,true);
 assert.equal(evaluateChampionQuestCondition({type:'HEALTH',owner:'ENEMY',op:'LTE',value:10},s,s.players[0]!.id,[]).completed,false);
});
test('AND accumulates independent event leaves even when another branch is false; OR evaluates all branches',()=>{
 const s=state(),id=s.players[0]!.id;
 const condition={type:'ALL' as const,conditions:[{type:'EVENT' as const,event:'CARD_PLAYED',owner:'SELF' as const,required:2},{type:'TURN' as const,turn:6}]};
 const first=evaluateChampionQuestCondition(condition,s,id,[{type:'CARD_PLAYED',playerId:id}]);
 const second=evaluateChampionQuestCondition(condition,s,id,[{type:'CARD_PLAYED',playerId:id}],first.counts);
 assert.equal(second.completed,false);s.turn=11;
 assert.equal(evaluateChampionQuestCondition(condition,s,id,[],second.counts).completed,true);
 assert.equal(evaluateChampionQuestCondition({...condition,type:'ANY'},s,id,[]).completed,true);
});
test('condition validation bounds depth, counts and fields, rejects unknown events',()=>{
 for(const c of [{type:'TURN',turn:0},{type:'HEALTH',owner:'SELF',op:'BAD',value:10},{type:'ALL',conditions:[]},{type:'EVENT',event:'fake',owner:'SELF',required:1},{type:'TURN',turn:3,unexpected:1}])assert.equal(validChampionQuestCondition(c),false);
 assert.equal(validChampionQuestCondition({type:'HEALTH',owner:'SELF',op:'LT',value:10}),true);
});
