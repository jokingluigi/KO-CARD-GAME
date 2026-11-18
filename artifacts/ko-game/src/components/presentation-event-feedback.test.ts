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
test('protection breaks only on a blocked result with actual consumed protection',()=>{
 const before={...card,dodgeAvailable:true,dodgeCharges:1};
 const after={...before,dodgeAvailable:false,dodgeCharges:0};
 const event={type:'DAMAGE_DEALT' as const,amount:0,tags:['DODGE'],target:{type:'CARD' as const,cardInstanceId:card.instanceId}};
 const b=new Map([[card.instanceId,before]]),a=new Map([[card.instanceId,after]]);
 assert.equal(statusPresentation([event],b,a,'break')[0]?.kind,'PROTECTION_BREAK');
 assert.deepEqual(statusPresentation([],b,a,'expired'),[]);
 assert.deepEqual(statusPresentation([event],b,b,'not-consumed'),[]);
});
test('fully absorbed armour contact is retained even without a damage-number draft',()=>{
 const event={type:'DAMAGE_DEALT' as const,reason:'COMBAT',amount:0,target:{type:'CARD' as const,cardInstanceId:card.instanceId}};
 const counter={...event,amount:2,target:{type:'CARD' as const,cardInstanceId:'attacker'}};
 const before=new Map([[card.instanceId,card]]),after=new Map(before),keys=['zero','counter'];
 const status=statusPresentation([event,counter],before,after,'zero-contact');
 const merged=mergeStatusPresentation(presentationCueDrafts([event,counter],0,keys),status,keys);
 assert.deepEqual(merged.map(c=>c.kind),['ARMOR','DAMAGE']);
 assert.deepEqual(mergeStatusPresentation([],status,keys).map(c=>c.kind),['ARMOR']);
 const dodged={...event,tags:['DODGE']};assert.deepEqual(statusPresentation([dodged],before,after,'dodge'),[]);
});
