import { resetCardAfterLeavingBoard } from '../cards/zone-state';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGameState } from './create-initial-game-state';
import { generateCardInstance } from '../cards/generation';
import type { CardDefinition } from '../cards/types';
import { applyEffect, getValidTargets } from '../effects/effect-engine';
import { executeAction } from '../actions/engine-actions';
import { isChampionProtectedByToken } from './direct-champion';
import { processChampionQuestEvents } from '../champions/quests';
const definition=(id:string,extra:Partial<CardDefinition>={}):CardDefinition=>({id,name:id,cost:1,attack:4,health:8,cardType:'WRESTLER',rulesText:'',keywords:[],abilities:[],isToken:false,isChampionToken:false,...extra});
function setup(extra:Partial<CardDefinition>={}) {
 const a=definition('attacker',{keywords:['LIFESTEAL']}),b=definition('defender',extra);
 const s=createInitialGameState();s.status='IN_PROGRESS';s.activePlayerId='player-1';s.turn=3;s.cardPool=[a,b];
 s.players[0].board=[{...generateCardInstance(a,{instanceId:'a'}),boardSlot:0},null,null,null];
 s.players[1].board=[{...generateCardInstance(b,{instanceId:'b'}),boardSlot:0},null,null,null];
 s.players[0].health=10;if(s.players[0].champion)s.players[0].champion.health=10;
 return s;
}
const damage={type:'STRUCTURED' as const,action:'DAMAGE' as const,target:{zone:'BOARD' as const,owner:'ENEMY' as const,selection:'PLAYER_CHOICE' as const,count:1},values:{amount:4}};
test('immune blocks manual effect selection but permits ordinary attacks and area damage',()=>{
 const s=setup({keywords:['IMMUNE']});
 assert.deepEqual(getValidTargets(s,'player-1',s.players[0].board[0]!,damage),[]);
 assert.deepEqual(getValidTargets(s,'player-1',s.players[0].board[0]!,{...damage,target:{...damage.target,selection:'RANDOM'}}),[]);
 assert.equal(applyEffect(s,'player-1',s.players[0].board[0]!,damage,['b']).players[1].board[0]!.currentHealth,8);
 const area=applyEffect(s,'player-1',s.players[0].board[0]!,{...damage,target:{...damage.target,selection:'ALL'}});
 assert.equal(area.players[1].board[0]!.currentHealth,4);
 assert.equal(executeAction(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'a',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'b'}}).success,true);
});
test('armor subtracts configured amount on effects and combat; lifesteal heals by reduced attack damage only',()=>{
 const s=setup({keywords:['ARMOR'],effectConfig:{armor:2}});
 assert.equal(applyEffect(s,'player-1',s.players[0].board[0]!,damage,['b']).players[1].board[0]!.currentHealth,6);
 const result=executeAction(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'a',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'b'}});
 assert.equal(result.success,true);assert.equal(result.state.players[1].board[0]!.currentHealth,6);assert.equal(result.state.players[0].health,12);
 const blocked=setup({keywords:['ARMOR'],effectConfig:{armor:9}});
 assert.equal(applyEffect(blocked,'player-1',blocked.players[0].board[0]!,damage,['b']).players[1].board[0]!.currentHealth,8);
});
test('entry defense rejects attacks, blocks damage without consuming dodge and expires after its owner turn',()=>{
 const s=setup({keywords:['DEFENSE','DODGE']});s.players[1].board[0]!.enteredThisTurn=true;
 assert.equal(executeAction(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'a',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'b'}}).success,false);
 const blocked=applyEffect(s,'player-1',s.players[0].board[0]!,damage,['b']);assert.equal(blocked.players[1].board[0]!.currentHealth,8);assert.equal(blocked.players[1].board[0]!.dodgeCharges,1);
 s.activePlayerId='player-2';const ended=executeAction(s,{type:'END_TURN',playerId:'player-2'});assert.equal(ended.success,true);assert.equal(ended.state.players[1].board[0]!.enteredThisTurn,false);
});
test('healing at turn end applies to both sides and caps at max health',()=>{
 const s=setup();s.players[0].board[0]!.keywords=['REGEN'];s.players[0].board[0]!.currentHealth=7;s.players[1].board[0]!.keywords=['REGEN'];s.players[1].board[0]!.currentHealth=4;
 const healed=executeAction(s,{type:'END_TURN',playerId:'player-1'});assert.equal(healed.state.players[0].board[0]!.currentHealth,8);assert.equal(healed.state.players[1].board[0]!.currentHealth,6);
});
test('conditional cards reject forged plays until their configured state condition is true',()=>{
 const s=setup();const d=definition('conditional',{keywords:['CONDITION'],effectConfig:{playCondition:{type:'TURN',turn:5}}});
 s.players[0].hand=[generateCardInstance(d,{instanceId:'c'})];s.players[0].currentGold=10;
 const play={type:'PLAY_WRESTLER' as const,playerId:'player-1',cardInstanceId:'c',boardSlot:1 as const};
 assert.equal(executeAction(s,play).success,false);s.turn=5;assert.equal(executeAction(s,play).success,true);
});
test('any Champion rarity card protects its portrait only while present and is itself removable',()=>{
 const s=setup({rarity:'CHAMPION'});assert.equal(isChampionProtectedByToken(s,'player-2'),true);
 const removal={type:'STRUCTURED' as const,action:'DESTROY' as const,target:damage.target};
 assert.deepEqual(getValidTargets(s,'player-1',s.players[0].board[0]!,removal),['b']);
 const removed=applyEffect(s,'player-1',s.players[0].board[0]!,removal,['b']);assert.equal(isChampionProtectedByToken(removed,'player-2'),false);assert.equal(removed.players[1].health,s.players[1].health);
});
test('ALL-owner character damage reaches selected enemy portrait (Pandora upgraded ability path)',()=>{
 const s=setup();const result=applyEffect(s,'player-1',s.players[0].board[0]!,{...damage,target:{zone:'CHARACTER',owner:'ALL',selection:'PLAYER_CHOICE',count:1}},['player-2']);
 assert.equal(result.players[1].health,s.players[1].health-4);
});
test('state-driven champion quest reward completes once without a counted event and survives repeated actions',()=>{
 const s=setup();const p=s.players[0];assert.ok(p.champion);p.champion.quest={id:'health-quest',name:'Health',description:'',trackedEvent:'TURN_STARTED',condition:{type:'HEALTH',owner:'SELF',op:'LTE',value:10},requiredProgress:1,reward:{type:'GAIN_GOLD',amount:3}};p.champion.questCompleted=false;p.champion.questProgress=0;
 const once=processChampionQuestEvents(s,{...s,events:[...s.events]});assert.equal(once.players[0].champion!.questCompleted,true);assert.equal(once.players[0].currentGold,p.currentGold+3);
 const twice=processChampionQuestEvents(once,once);assert.equal(twice.events.filter(e=>e.type==='CHAMPION_QUEST_COMPLETED').length,1);assert.equal(twice.players[0].currentGold,once.players[0].currentGold);
});

test('configured dodge count absorbs exactly that many damage events',()=>{
 let state=setup({keywords:['DODGE'],effectConfig:{dodgeCharges:3}});
 assert.equal(state.players[1].board[0]!.dodgeCharges,3);
 for(let remaining=2;remaining>=0;remaining--){state=applyEffect(state,'player-1',state.players[0].board[0]!,damage,['b']);assert.equal(state.players[1].board[0]!.currentHealth,8);assert.equal(state.players[1].board[0]!.dodgeCharges,remaining);}
 state=applyEffect(state,'player-1',state.players[0].board[0]!,damage,['b']);assert.equal(state.players[1].board[0]!.currentHealth,4);
});

test('configured dodge count survives draw and resets on zone movement without a registered catalog',()=>{
 const instance=generateCardInstance(definition('unregistered-counted-dodge',{keywords:['DODGE'],effectConfig:{dodgeCharges:4}}),{instanceId:'counted'});
 assert.equal(resetCardAfterLeavingBoard({...instance,dodgeCharges:1}).dodgeCharges,4);
});
