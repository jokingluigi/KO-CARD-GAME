import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardRecordToDefinition } from '../cards/published-cards';
import { generateCardInstance } from '../cards/generation';
import { createDeckFromDefinitionIds, createTestDeck } from '../cards/test-cards';
import { createInitialGameState } from './create-initial-game-state';
import { drawCard } from './draw-card';
import { enterField } from './enter-field';
import { executeAction, getLegalActions } from '../actions/engine-actions';
import { applyEffect } from '../effects/effect-engine';
import { hasEntryDefense } from './keyword-rules';
import type { CardDefinition } from '../cards/types';
import type { GameState } from '../types/game-state';
const records=JSON.parse(readFileSync(new URL('../qa/fixtures/quick-match-reported-cards.json',import.meta.url),'utf8')).cards;
const definitions:CardDefinition[]=records.map(cardRecordToDefinition);
const unit:CardDefinition={id:'quick-unit',name:'검사 선수',cardType:'WRESTLER',cost:2,attack:2,health:8,rulesText:'',isToken:false,isChampionToken:false,keywords:[],abilities:[]};
function setup(name:string){
 const definition=definitions.find(c=>c.name===name)!;
 const deck=[definition.id,...Array(24).fill(unit.id)];
 let state=createInitialGameState(undefined,[...definitions,unit],undefined,[deck,Array(25).fill(unit.id)]);
 state.status='IN_PROGRESS';state.turn=3;state.activePlayerId='player-1';
 for(const p of state.players){p.currentGold=100;p.mulliganUsed=true;}
 // Exercise the real owned-deck factory and draw path, then serialized online state.
 state=JSON.parse(JSON.stringify(drawCard(state,'player-1')));
 return {state,definition,source:state.players[0].hand[0]};
}
const enemy=(id:string,extra:Record<string,unknown>={})=>({...generateCardInstance(unit,{instanceId:id}),boardSlot:0 as const,...extra});
const play=(s:GameState)=>executeAction(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:s.players[0].hand[0].instanceId,boardSlot:0});
test('both owned and implicit decks preserve published runtime rules, armor, dodge charges and conditions',()=>{
 const allRecords=JSON.parse(readFileSync(new URL('../qa/fixtures/cards-2026-10-04.json',import.meta.url),'utf8'));
 const all:CardDefinition[]=allRecords.map(cardRecordToDefinition).filter((c:CardDefinition)=>!c.isToken&&!c.isChampionToken);
 for(const d of all){const c=createDeckFromDefinitionIds('PLAYER_ONE',[d.id],all)[0];assert.equal(c.contentRule,d.contentRule,d.name);assert.equal(c.baseCost,d.cost,d.name);assert.deepEqual(c.abilities,d.abilities,d.name);}
 const conditional={...unit,id:'deck-condition',keywords:['CONDITION','ARMOR','DODGE'] as CardDefinition['keywords'],effectConfig:{playCondition:{type:'TURN',turn:5},armor:2,dodgeCharges:3}};
 for(const factory of [()=>createDeckFromDefinitionIds('player-1',[conditional.id],[conditional]),()=>createTestDeck('player-1',[conditional])]){
  const s=createInitialGameState();s.status='IN_PROGRESS';s.activePlayerId='player-1';s.turn=3;s.cardPool=[conditional];s.players[0].currentGold=100;s.players[0].hand=[factory()[0]];
  assert.equal(play(s).success,false);s.turn=5;const r=play(s);assert.ok(r.success);const c=r.state.players[0].board[0]!;assert.equal(c.armor,2);assert.equal(c.dodgeCharges,3);
 }
});
test('owned-deck vampire entrance deals actual damage and gains attack, including armor/defense exclusions',()=>{
 const {state,definition,source}=setup('뱀파이어 왕자 MPG');
 assert.equal(source.contentRule,'뱀파이어 왕자 MPG');
 state.players[1].board=[enemy('ordinary',{currentHealth:1}),enemy('armor',{boardSlot:1,keywords:['ARMOR'],armor:1}),enemy('defense',{boardSlot:2,keywords:['DEFENSE'],entryDefenseActive:true}),enemy('ordinary2',{boardSlot:3})];
 const result=play(state);assert.ok(result.success);
 const after=result.state;assert.equal(after.players[0].board[0]!.currentAttack,definition.attack+2);
 assert.equal(after.players[1].board[0],null);assert.equal(after.players[1].board[1]!.currentHealth,8);assert.equal(after.players[1].board[2]!.currentHealth,8);assert.equal(after.players[1].board[3]!.currentHealth,7);
 assert.equal(after.players[0].board[0]!.baseAttack,definition.attack);
});
test('owned-deck Hillbil heals itself after causally retiring an enemy through the dispatcher',()=>{
 const {state,definition,source}=setup('힐빌');assert.equal(source.contentRule,'힐빌');
 let r=play(state);assert.ok(r.success);r.state.players[0].board[0]!.enteredThisTurn=false;r.state.players[0].board[0]!.currentHealth=1;
 r.state.players[1].board[0]=enemy('victim',{currentAttack:0,currentHealth:1});
 r=executeAction(r.state,{type:'ATTACK',playerId:'player-1',attackerInstanceId:source.instanceId,target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'victim'}});
 assert.ok(r.success);assert.equal(r.state.players[0].board[0]!.currentHealth,3);assert.equal(r.state.players[0].board[0]!.maxHealth,definition.health);assert.equal(r.state.players[1].board[0],null);
});
test('owned-deck Ozen destroys a cost-one ordinary token rather than excluding all tokens',()=>{
 const {state}=setup('오젠');const zombie=definitions.find(c=>c.name==='좀비')!;
 state.players[1].board[0]={...generateCardInstance(zombie,{instanceId:'zombie'}),boardSlot:0};
 state.players[1].board[1]=enemy('two',{boardSlot:1,currentCost:2});
 const r=play(state);assert.ok(r.success);assert.equal(r.state.players[1].board[0],null);assert.ok(r.state.players[1].board[1]);assert.equal(r.state.players[1].graveyard.length,0);
});
test('defense survives own turn end, prevents opponent attacks and all damage, then expires at own turn start',()=>{
 let {state}=setup('힐빌');state.players[0].hand[0].keywords=['DEFENSE'];let r=play(state);assert.ok(r.success);state=r.state;
 const id=state.players[0].board[0]!.instanceId;state.players[1].board[0]=enemy('attacker');
 r=executeAction(state,{type:'END_TURN',playerId:'player-1'});assert.ok(r.success);state=r.state;
 assert.ok(hasEntryDefense(state.players[0].board[0]!,state.turn));
 const action={type:'ATTACK' as const,playerId:'player-2',attackerInstanceId:'attacker',target:{type:'WRESTLER' as const,playerId:'player-1',cardInstanceId:id}};
 assert.equal(executeAction(state,action).success,false);assert.ok(!getLegalActions(state,'player-2').some(a=>a.type==='ATTACK'&&a.target.type==='WRESTLER'&&a.target.cardInstanceId===id));
 const hp=state.players[0].board[0]!.currentHealth;
 state=applyEffect(state,'player-2',state.players[1].board[0]!,{type:'STRUCTURED',action:'DAMAGE',target:{zone:'BOARD',owner:'ENEMY',selection:'ALL',count:4},values:{amount:99}});
 assert.equal(state.players[0].board[0]!.currentHealth,hp);
 r=executeAction(state,{type:'END_TURN',playerId:'player-2'});assert.ok(r.success);state=r.state;assert.equal(hasEntryDefense(state.players[0].board[0]!,state.turn),false);
});
test('a defense unit summoned during the opponent turn expires at the immediately following owner turn',()=>{
 let {state}=setup('힐빌');state.activePlayerId='player-2';
 const card={...state.players[0].hand[0],keywords:['DEFENSE' as const]};state.players[0].hand=[];
 state=enterField(state,'player-1',card,0,undefined,undefined,'SUMMON');assert.ok(hasEntryDefense(state.players[0].board[0]!,state.turn));
 const r=executeAction(state,{type:'END_TURN',playerId:'player-2'});assert.ok(r.success);assert.equal(hasEntryDefense(r.state.players[0].board[0]!,r.state.turn),false);
});
