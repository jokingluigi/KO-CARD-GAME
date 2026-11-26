// 2026-11-26 대표 결정 E-2: 동시에 일어난 일만 같은 묶음.
import assert from 'node:assert/strict';import test from 'node:test';
import {presentationCueDrafts} from './presentation-feedback-utils';
import type {GameEvent} from '../game';
const card=(id:string)=>({type:'CARD' as const,cardInstanceId:id});
const hit=(from:string,to:string,reason:string,amount=2):GameEvent=>({type:'DAMAGE_DEALT',source:card(from),target:card(to),reason,amount} as GameEvent);
const retire=(id:string):GameEvent=>({type:'CARD_RETIRED',cardInstanceId:id,target:card(id),reason:'RETIRE'} as GameEvent);

test('attack and counter share one moment; a reaction waits for the next; simultaneous retirements share one',()=>{
  const events=[hit('a','b','COMBAT'),hit('b','a','COMBAT'),hit('b','c','CARD_EFFECT'),retire('a'),retire('b')];
  const drafts=presentationCueDrafts(events,0);
  const g=drafts.map(d=>d.group);
  assert.equal(g[0],g[1],'공격과 반격은 동시에');
  assert.notEqual(g[2],g[1],'반응 피해는 다음 차례');
  assert.equal(g[3],g[4],'동시에 쓰러짐');
  assert.notEqual(g[3],g[2]);
});

test('one card hitting several targets at once is one moment',()=>{
  const drafts=presentationCueDrafts([hit('x','l','CARD_EFFECT'),hit('x','m','CARD_EFFECT'),hit('x','r','CARD_EFFECT')],0);
  assert.equal(new Set(drafts.map(d=>d.group)).size,1);
});
