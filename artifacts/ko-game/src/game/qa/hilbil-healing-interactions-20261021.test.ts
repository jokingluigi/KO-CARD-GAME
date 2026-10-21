/** Fresh authenticated administrator hash checked again at 2026-10-21T13:25Z. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {cardRecordToDefinition,createInitialGameState,generateCardInstance,executeAction,applyEffect,type GameState} from '../index';
const definitions=JSON.parse(readFileSync('docs/qa/snapshots/20261021-admin/cards.json','utf8')).map(cardRecordToDefinition);
const definition=(name:string)=>{const d=definitions.find(d=>d.name===name);assert.ok(d,name);return d;};
function setup(healerName:string,maxHealth:number,regeneration=false){
 const s=createInitialGameState(undefined,definitions);s.cardPool=definitions;s.status='IN_PROGRESS';s.turn=3;s.activePlayerId='player-1';s.events=[];
 for(const p of s.players){p.board=[null,null,null,null];p.hand=[];p.health=20;p.currentGold=10;p.champion!.quest=null;p.deck=Array.from({length:4},(_,i)=>generateCardInstance(definition('힐빌'),{instanceId:p.id+'-deck-'+i}));}
 s.players[0].board[0]={...generateCardInstance(definition('힐빌'),{instanceId:'hilbil'}),currentHealth:2,maxHealth,boardSlot:0,enteredThisTurn:false,...(regeneration?{keywords:['REGEN' as const]}:{})};
 s.players[0].board[1]={...generateCardInstance(definition(healerName),{instanceId:'healer'}),boardSlot:1,enteredThisTurn:false};
 s.players[1].board[0]={...generateCardInstance(definition('힐빌'),{instanceId:'enemy'}),currentAttack:1,currentHealth:1,boardSlot:0,enteredThisTurn:false};return s;
}
function action(s:GameState,a:Parameters<typeof executeAction>[1]){const r=executeAction(s,a);assert.ok(r.success,r.message);return r.state;}
function attack(s:GameState){return action(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'hilbil',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'enemy'}});}
for(const healer of ['카산드라','위마리(각성)','헬퍼','카스토'])for(const max of [4,20])test(`Hilbil recovers fully after prior healing with ${healer}, maximum HP ${max}`,()=>{
 let s=setup(healer,max);const h=s.players[0].board[1]!;
 s=applyEffect(s,'player-1',h,{type:'STRUCTURED',action:'HEAL',target:{zone:'BOARD',owner:'SELF',selection:'PLAYER_CHOICE',count:1},values:{amount:1}},['hilbil']);
 s=attack(s);assert.equal(s.players[1].board[0],null);assert.equal(s.players[0].board[0]!.currentHealth,max);assert.equal(s.players[0].board[0]!.maxHealth,max);assert.equal(s.players[0].health,20);
});
for(const healer of ['카산드라','위마리(각성)'])test(`Hilbil survives real healing turn effects and regeneration before its next combat: ${healer}`,()=>{
 let s=setup(healer,20,true);s=action(s,{type:'END_TURN',playerId:'player-1'});s=action(s,{type:'END_TURN',playerId:'player-2'});assert.ok(s.players[0].board[0]!.currentHealth>2);s=attack(s);assert.equal(s.players[0].board[0]!.currentHealth,20);assert.equal(s.players[1].board[0],null);
});
test('external healing preserves Hilbil ability, but a nonlethal hit does not count as retiring an opponent',()=>{
 const s=setup('카산드라',20);s.players[1].board[0]!.currentHealth=10;const n=attack(s);assert.ok(n.players[1].board[0]);assert.equal(n.players[0].board[0]!.currentHealth,1);
});
for(const maximum of [4,20])test(`reported normal Wimari combo preserves Hilbil's combat retirement and fully heals its increased maximum ${maximum}`,()=>{
 let s=setup('위마리',maximum);s.players[0].board[1]=null;s.players[0].hand=[generateCardInstance(definition('위마리'),{instanceId:'wimari-from-hand'})];
 s=action(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:'wimari-from-hand',boardSlot:1});s=attack(s);
 assert.equal(s.players[1].board[0],null);assert.equal(s.players[0].board[0]!.maxHealth,maximum+1);assert.equal(s.players[0].board[0]!.currentHealth,maximum+1);
 const retirement=s.events.find(e=>e.type==='CARD_RETIRED'&&e.cardInstanceId==='enemy');assert.equal(retirement?.source?.type,'CARD');assert.equal((retirement?.source as any).cardInstanceId,'hilbil');
});
test('Wimari combo on a nonlethal attack increases health once without granting Hilbil a kill heal',()=>{
 const s=setup('위마리',20);s.players[1].board[0]!.currentHealth=10;const n=attack(s);assert.equal(n.players[0].board[0]!.currentHealth,2);assert.equal(n.players[0].board[0]!.maxHealth,21);assert.ok(n.players[1].board[0]);
});
test('two Hilbils with Wimari only heal the actual attacker who retired the enemy',()=>{
 const s=setup('위마리',20);s.players[0].board[2]={...generateCardInstance(definition('힐빌'),{instanceId:'other-hilbil'}),currentHealth:2,maxHealth:20,boardSlot:2,enteredThisTurn:false};const n=attack(s);assert.equal(n.players[0].board[0]!.currentHealth,21);assert.equal(n.players[0].board[2]!.currentHealth,2);
});
