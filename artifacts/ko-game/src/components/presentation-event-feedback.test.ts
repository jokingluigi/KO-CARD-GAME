import assert from 'node:assert/strict';
import test from 'node:test';
import { generateCardInstance, type CardDefinition } from '../game';
import { statusPresentation, withEffectSources, mergeStatusPresentation } from './presentation-event-feedback';
import { presentationCueDrafts } from './presentation-feedback-utils';
const def:CardDefinition={id:'visual-armor',name:'QA',cardType:'WRESTLER',cost:3,attack:4,health:5,rulesText:'',keywords:['ARMOR'],effectConfig:{armor:2},rarity:'COMMON',abilities:[]};
const card=generateCardInstance(def,{instanceId:'armored'});
test('armor is combat-only feedback and never consumes its stat',()=>{
 const before=new Map([[card.instanceId,card]]),after=new Map(before);
 const snapshot=JSON.stringify(card);
 const events=[{type:'DAMAGE_DEALT' as const,reason:'COMBAT',amount:3,target:{type:'CARD' as const,cardInstanceId:card.instanceId}},{type:'DAMAGE_DEALT' as const,reason:'EFFECT',amount:3,target:{type:'CARD' as const,cardInstanceId:card.instanceId}}];
 const cues=statusPresentation(events,before,after,'b');
 assert.deepEqual(cues.map(c=>[c.kind,c.eventIndex]),[['ARMOR',0]]);
 assert.equal(JSON.stringify(card),snapshot);
 const ordered=mergeStatusPresentation(presentationCueDrafts(events,0,['event0','event1']),cues,['event0','event1']);
 assert.deepEqual(ordered.map(c=>c.kind),['ARMOR','DAMAGE','DAMAGE']);
});
test('silence feedback is a transition and reconnect produces no duplicate',()=>{
 const muted={...card,isSilenced:true},before=new Map([[card.instanceId,card]]),after=new Map([[card.instanceId,muted]]);
 assert.equal(statusPresentation([],before,after,'b')[0]?.kind,'SILENCE');
 assert.deepEqual(statusPresentation([],after,after,'restore'),[]);
});
test('source pulse precedes effect results without moving gameplay events',()=>{
 const cues=presentationCueDrafts([{type:'DAMAGE_DEALT',amount:2,source:{type:'CARD',cardInstanceId:'caster'},target:{type:'CARD',cardInstanceId:card.instanceId}},{type:'DAMAGE_DEALT',amount:3,source:{type:'CARD',cardInstanceId:'caster'},target:{type:'PLAYER',playerId:'enemy'}}],0);
 const result=withEffectSources(cues);
 assert.deepEqual(result.map(c=>c.kind),['EFFECT','DAMAGE','DAMAGE']);
 assert.deepEqual(result.filter(c=>c.kind!=='EFFECT'),cues);
});
