// 2026-11-26 대표 결정 C2: 광역 피해는 모두 먼저 맞고, 반응 효과는 왼쪽부터 차례로.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {cardRecordToDefinition,createInitialGameState,generateCardInstance,applyEffect} from '../index';
const definitions=JSON.parse(readFileSync('docs/qa/snapshots/20261021-admin/cards.json','utf8')).map(cardRecordToDefinition);
const base=definitions.find((d:{name:string})=>d.name==='힐빌')!;
const reacting=(id:string,slot:0|1|2|3,health:number)=>({...generateCardInstance(base,{instanceId:id}),currentHealth:health,maxHealth:health,boardSlot:slot,enteredThisTurn:false,keywords:[],
  abilities:[{trigger:'SELF_DAMAGED' as const,effects:[{type:'STRUCTURED' as const,action:'BUFF' as const,target:{zone:'BOARD' as const,owner:'SELF' as const,selection:'SELF' as const,count:1},values:{attack:1}}]}]});
function setup(){
  const s=createInitialGameState(undefined,definitions);s.cardPool=definitions;s.status='IN_PROGRESS';s.turn=3;s.activePlayerId='player-1';s.events=[];
  for(const p of s.players){p.board=[null,null,null,null];p.hand=[];}
  s.players[0].board[0]={...generateCardInstance(base,{instanceId:'caster'}),boardSlot:0,enteredThisTurn:false,abilities:[]};
  s.players[1].board[0]=reacting('left',0,5);
  s.players[1].board[2]=reacting('right',2,5);
  return s;
}
const aoe={type:'STRUCTURED' as const,action:'DAMAGE' as const,target:{zone:'BOARD' as const,owner:'ENEMY' as const,selection:'ALL' as const,count:4},values:{amount:2}};

test('area damage: every target is hit first, then reactions resolve left to right',()=>{
  const s=setup();const caster=s.players[0].board[0]!;
  const n=applyEffect(s,'player-1',caster,aoe);
  const order=n.events.map(e=>e.type==='DAMAGE_DEALT'?`hit:${(e.target as {cardInstanceId:string}).cardInstanceId}`:e.type==='STAT_CHANGED'?`react:${e.cardInstanceId}`:null).filter(Boolean);
  assert.deepEqual(order.slice(0,2),['hit:left','hit:right'],JSON.stringify(order));
  const reactions=order.filter(o=>o!.startsWith('react:'));
  assert.deepEqual(reactions,['react:left','react:right']);
  assert.equal(n.players[1].board[0]!.currentHealth,3);assert.equal(n.players[1].board[2]!.currentHealth,3);
});

test('area damage: lethal targets are all hit before the first one retires',()=>{
  const s=setup();s.players[1].board[0]!.currentHealth=1;s.players[1].board[2]!.currentHealth=1;const caster=s.players[0].board[0]!;
  const n=applyEffect(s,'player-1',caster,aoe);
  const order=n.events.map(e=>e.type==='DAMAGE_DEALT'?`hit:${(e.target as {cardInstanceId:string}).cardInstanceId}`:e.type==='CARD_RETIRED'?`retire:${e.cardInstanceId}`:null).filter(Boolean);
  assert.deepEqual(order,['hit:left','hit:right','retire:left','retire:right']);
});
