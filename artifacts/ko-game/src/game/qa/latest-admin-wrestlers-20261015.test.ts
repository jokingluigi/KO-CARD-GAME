import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { cardRecordToDefinition, type PublishedCardRecord } from '../cards/published-cards';
import { generateCardInstance } from '../cards/generation';
import { getActiveCardKeywords } from '../cards/granted-text';
import type { CardDefinition } from '../cards/types';
import { createInitialGameState } from '../engine/create-initial-game-state';
import { executeAction, getLegalActions } from '../actions/engine-actions';
import { applyEffect, resolveTriggeredAbilities } from '../effects/effect-engine';
const records = JSON.parse(readFileSync(new URL('../../../../../docs/qa/snapshots/20261015-wrestler-revisions/cards.json', import.meta.url), 'utf8')) as PublishedCardRecord[];
const definitions = records.map(cardRecordToDefinition);
function definition(name: string) { const d = definitions.find(d => d.name === name); assert.ok(d, name); return d; }
const vanilla: CardDefinition = { id: 'latest-qa-vanilla', name: '검증 선수', cardType: 'WRESTLER', cost: 1, attack: 2, health: 6, rulesText: '', keywords: [], abilities: [], isToken: false, isChampionToken: false, status: 'PUBLISHED' };
function setup() {
 const s = createInitialGameState(); s.status = 'IN_PROGRESS'; s.turn = 3; s.activePlayerId = 'player-1'; s.cardPool = definitions; s.minionACardPool = definitions; s.events = []; s.randomSeed = 101;
 for (const p of s.players) { p.currentGold = 99; p.health = 20; p.hand = []; p.board = [null,null,null,null]; p.graveyard = []; p.deck = Array.from({length:12},(_,i)=>generateCardInstance(vanilla,{instanceId:p.id+'-deck-'+i})); if(p.champion) {p.champion.health=20; p.champion.quest=undefined;} }
 return s;
}
function board(s: ReturnType<typeof setup>, d: CardDefinition = vanilla, owner = 1, slot: 0|1|2|3 = 0) {
 if (!s.cardPool?.some(entry=>entry.id===d.id)) s.cardPool=[...(s.cardPool??[]),d];
 const c = {...generateCardInstance(d,{instanceId:`${owner}-${slot}-${d.id}`}),boardSlot:slot,enteredThisTurn:false,entryDefenseActive:false}; s.players[owner].board[slot]=c; return c;
}
function play(s:ReturnType<typeof setup>,name:string,slot:0|1|2|3=0,target?:string) {
 const d=definition(name), card=generateCardInstance(d,{instanceId:'played'}); s.players[0].hand.unshift(card);
 const result=executeAction(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:card.instanceId,boardSlot:slot}); assert.ok(result.success,name);
 if(!target)return result.state;
 const chosen=executeAction(result.state,{type:'SELECT_EFFECT_TARGET',playerId:'player-1',targetId:target}); assert.ok(chosen.success,name+' selection');return chosen.state;
}
test('latest pain musician deals 3 to own champion and adds exactly 2 attack at real turn end',()=>{
 const s=play(setup(),'고통 연주자');const before=s.players[0].board[0]!.currentAttack;
 const ended=executeAction(s,{type:'END_TURN',playerId:'player-1'});assert.ok(ended.success);assert.equal(ended.state.players[0].health,17);assert.equal(ended.state.players[0].board[0]!.currentAttack,before+2);
});
test('latest fanatic gains attack only, once per actual champion damage event',()=>{
 const s=play(setup(),'광신도'), before=s.players[0].board[0]!;
 const damaged=applyEffect(s,'player-2',s.players[1].deck[0],{type:'STRUCTURED',action:'DAMAGE',target:{zone:'PLAYER',owner:'ENEMY',selection:'SELF',count:1},values:{amount:2}});
 assert.equal(damaged.players[0].board[0]!.currentAttack,before.currentAttack+1);assert.equal(damaged.players[0].board[0]!.maxHealth,before.maxHealth);assert.equal(damaged.players[0].board[0]!.currentHealth,before.currentHealth);
 const zero=applyEffect(s,'player-2',s.players[1].deck[0],{type:'STRUCTURED',action:'DAMAGE',target:{zone:'PLAYER',owner:'ENEMY',selection:'SELF',count:1},values:{amount:0}});assert.equal(zero.players[0].board[0]!.currentAttack,before.currentAttack);
});
test('latest immature alchemist excludes itself, including empty friendly field',()=>{
 const solo=play(setup(),'미숙한 연금술사');assert.equal(solo.players[0].board[0]!.currentAttack,definition('미숙한 연금술사').attack);
 const s=setup();board(s,vanilla,0,1);const result=play(s,'미숙한 연금술사');assert.equal(result.players[0].board[1]!.currentAttack,3);assert.equal(result.players[0].board[1]!.currentHealth,7);
});
test('latest small devil deals 2 before granting itself +1/+1',()=>{
 const s=setup();const ally=board(s,vanilla,0,1);const result=play(s,'작고 조그마한 악마',0,ally.instanceId);assert.equal(result.players[0].board[1]!.currentHealth,4);assert.equal(result.players[0].board[0]!.currentAttack,definition('작고 조그마한 악마').attack+1);
});
test('latest Ruina excludes its own definition from generation and counts its tagged live zones',()=>{
 const s=setup();const tagged={...vanilla,id:'tagged',tags:['디 어쏘리티']};s.cardPool=[definition('루이나'),tagged];s.minionACardPool=s.cardPool;
 const result=play(s,'루이나');assert.equal(result.players[0].hand.length,1);assert.equal(result.players[0].hand[0].definitionId,'tagged');const count=result.players[0].hand.filter(c=>c.tags?.includes('디 어쏘리티')).length+result.players[0].board.filter(c=>c?.tags?.includes('디 어쏘리티')).length;assert.equal(result.players[0].board[0]!.currentAttack,definition('루이나').attack+count);
});
test('latest Cassandra generates another public authority wrestler and grants only that card regeneration',()=>{
 const s=setup();const tagged={...vanilla,id:'authority-candidate',tags:['디 어쏘리티']};s.cardPool=[definition('카산드라'),tagged,{...tagged,id:'draft',status:'DRAFT'},{...tagged,id:'token',isToken:true}];s.minionACardPool=s.cardPool;const original=generateCardInstance(vanilla,{instanceId:'old-hand'});s.players[0].hand=[original];
 const result=play(s,'카산드라');const generated=result.players[0].hand.find(c=>c.definitionId==='authority-candidate');assert.ok(generated);assert.ok(generated.keywords.includes('REGEN'));assert.ok(!result.players[0].hand.find(c=>c.instanceId===original.instanceId)!.keywords.includes('REGEN'));
 result.players[0].health=18;result.players[0].champion!.health=18;const ended=executeAction(result,{type:'END_TURN',playerId:'player-1'});assert.ok(ended.success);assert.equal(ended.state.players[0].health,19);
});
test('latest Pandora pinfall grants +1/+1 once to itself and other tagged allies only',()=>{
 const s=setup();const tagged=board(s,{...vanilla,id:'tagged',tags:['디 어쏘리티']},0,1);board(s,vanilla,0,2);const enemy=board(s,{...vanilla,health:1});const result=play(s,'판도라',0,enemy.instanceId);
 assert.equal(result.players[0].board[0]!.currentAttack,definition('판도라').attack+1);assert.equal(result.players[0].board[1]!.currentAttack,tagged.currentAttack+1);assert.equal(result.players[0].board[2]!.currentAttack,2);
});
test('latest destruction messenger replaces a sourced retirement and gains only +1/+1',()=>{
 const s=setup();const ally=board(s,{...vanilla,attack:10,health:20},0,1);const enemy=board(s,{...vanilla,health:3});let n=play(s,'카르자엘, 파괴의 천사',0,ally.instanceId);const before=n.players[0].board[1]!.currentAttack;
 const hit=executeAction(n,{type:'ATTACK',playerId:'player-1',attackerInstanceId:ally.instanceId,target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:enemy.instanceId}});assert.ok(hit.success);n=hit.state;assert.equal(n.players[1].board[0],null);assert.equal(n.players[1].graveyard.length,0);assert.equal(n.players[0].board[1]!.currentAttack,before+1);
});
test('latest awakened dealer cannot attack champion until every opposing field slot is empty',()=>{
 const s=setup();const dealer=board(s,definition('리온(각성)'),0);board(s);const championAttack={type:'ATTACK' as const,playerId:'player-1',attackerInstanceId:dealer.instanceId,target:{type:'PLAYER' as const,playerId:'player-2'}};
 assert.equal(executeAction(s,championAttack).success,false);assert.ok(!getLegalActions(s,'player-1').some(a=>a.type==='ATTACK'&&a.target.type==='PLAYER'));
 const clear=structuredClone(s);clear.players[1].board=[null,null,null,null];assert.equal(executeAction(clear,championAttack).success,true);
});
for(const name of ['씨 몬스터','여울의 보디가드','황소할배'])test(`latest administrator keyword flags load without stat overrides: ${name}`,()=>{
 const record=records.find(c=>c.name===name)!;const d=definition(name);assert.equal(d.attack,record.attack);assert.equal(d.health,record.health);assert.deepEqual(d.keywords,record.keywords);
});
