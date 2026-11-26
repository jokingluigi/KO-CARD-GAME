// 2026-11-26 대표 지시: 하스스톤과 비슷한 장치는 하스스톤 방식으로.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {cardRecordToDefinition,createInitialGameState,generateCardInstance,executeAction} from '../index';
const definitions=JSON.parse(readFileSync('docs/qa/snapshots/20261021-admin/cards.json','utf8')).map(cardRecordToDefinition);
const base=definitions.find((d:{name:string})=>d.name==='힐빌')!;
const mk=(id:string,atk:number,hp:number,slot:number,abilities:unknown[]=[],keywords:string[]=[])=>({...generateCardInstance(base,{instanceId:id}),currentAttack:atk,currentHealth:hp,maxHealth:hp,boardSlot:slot,enteredThisTurn:false,keywords,abilities}) as never;
function setup(){const s=createInitialGameState(undefined,definitions);s.cardPool=definitions;s.status='IN_PROGRESS';s.turn=3;s.activePlayerId='player-1';s.events=[];for(const p of s.players){p.board=[null,null,null,null];p.hand=[];p.health=20;}return s;}
const attack=(s:ReturnType<typeof setup>)=>{const r=executeAction(s,{type:'ATTACK',playerId:'player-1',attackerInstanceId:'att',target:{type:'WRESTLER',playerId:'player-2',cardInstanceId:'def'}});assert.ok(r.success,r.message);return r.state;};
const bounce={trigger:'EXACT_ZERO_DAMAGE',effects:[{type:'STRUCTURED',action:'MOVE_TO_HAND',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{}}]};
const where=(s:ReturnType<typeof setup>,id:string)=>s.players[0].board.some(c=>c?.instanceId===id)?'field':s.players[0].hand.some(c=>c.instanceId===id)?'hand':s.players[0].graveyard.some(c=>c.instanceId===id)?'grave':'none';

test('pinfall fires before deaths: a bounce saves an attacker the counter would have retired',()=>{
  const s=setup();s.players[0].board[0]=mk('att',3,2,0,[bounce]);s.players[1].board[0]=mk('def',2,3,0);
  const n=attack(s);
  assert.equal(where(n,'att'),'hand');
  assert.equal(n.players[1].board[0],null);
  assert.equal(n.events.filter(e=>e.type==='CARD_ADDED_TO_HAND'||e.type==='CARD_RETIRED').filter(e=>e.cardInstanceId==='att'&&e.type==='CARD_RETIRED').length,0);
});
test('pinfall still fires once when the attacker survives (unchanged order)',()=>{
  const s=setup();s.players[0].board[0]=mk('att',3,5,0,[bounce]);s.players[1].board[0]=mk('def',1,3,0);
  const n=attack(s);assert.equal(where(n,'att'),'hand');assert.equal(n.players[1].board[0],null);
});
test('a pinfall buff on a dying attacker resolves once and can keep it alive',()=>{
  const buff={trigger:'EXACT_ZERO_DAMAGE',effects:[{type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{health:3}}]};
  const s=setup();s.players[0].board[0]=mk('att',3,2,0,[buff]);s.players[1].board[0]=mk('def',2,3,0);
  const n=attack(s);const a=n.players[0].board[0];
  assert.equal(a?.instanceId,'att');assert.equal(a?.currentHealth,3);
});
test('a defending lifesteal card heals its owner with counter damage',()=>{
  const s=setup();s.players[0].board[0]=mk('att',2,5,0);s.players[1].board[0]=mk('def',3,5,0,[],['LIFESTEAL']);s.players[1].health=10;
  const n=attack(s);assert.equal(n.players[1].health,13);
});
test('an attack is cancelled when an on-attack effect removes its target (no phantom counter)',()=>{
  const s=setup();
  s.players[0].board[0]=mk('att',2,5,0,[{trigger:'BEFORE_ATTACK',effects:[{type:'STRUCTURED',action:'MOVE_TO_HAND',target:{zone:'BOARD',owner:'ENEMY',selection:'ALL',count:4},values:{}}]}]);
  s.players[1].board[0]=mk('def',4,5,0);
  const n=attack(s);
  assert.equal(n.players[0].board[0]?.currentHealth,5);
  assert.equal(n.events.some(e=>e.type==='DAMAGE_DEALT'),false);
  assert.ok((n.players[0].board[0]?.attacksUsedThisTurn??0)>=1,'공격 횟수는 사용됨');
});
