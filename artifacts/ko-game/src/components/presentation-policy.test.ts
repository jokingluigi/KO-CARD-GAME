import assert from 'node:assert/strict';import test from 'node:test';
import {damageHitStop,enqueuePresentation,presentationDuration,shakePixels,strongerShake,acceptsSound,presentationBatch} from './presentation-policy';
test('actual damage controls hit stop including weak hits and prevention',()=>{assert.deepEqual([0,1,2,3,5,6,9,10,999].map(damageHitStop),[0,30,30,65,65,105,105,120,120]);});
test('fast mode and queue pressure shorten visuals without eliminating them',()=>{assert.equal(presentationDuration(300,'FAST'),210);assert.ok(presentationDuration(300,'NORMAL',20)<presentationDuration(300));assert.ok(presentationDuration(1,'FAST',999)>0);});
test('long chains preserve order and all outcome IDs, deduplicate retries and accelerate',()=>{const cues=Array.from({length:80},(_,i)=>({id:String(i),kind:i===25?'QUEST_COMPLETE':i%3===0?'DAMAGE':'RETIRE',duration:360}));const queue=enqueuePresentation(cues.slice(0,20),cues.slice(10));assert.equal(queue.length,80);assert.deepEqual(queue.map(c=>c.id),cues.map(c=>c.id));assert.equal(queue[25].duration,360);assert.ok(queue[79].duration<queue[0].duration);});
test('shake arbitration keeps the strongest request and caps movement',()=>{assert.equal(strongerShake('HEAVY','LIGHT'),'HEAVY');assert.equal(strongerShake('LIGHT','VERY_HEAVY'),'VERY_HEAVY');assert.ok(shakePixels('VERY_HEAVY')<=22);});
test('small sounds never displace active finishers, but play after expiry',()=>{assert.equal(acceptsSound(9,500,2,400),false);assert.equal(acceptsSound(9,500,2,501),true);assert.equal(acceptsSound(5,500,9,400),true);});
test('independent feedback overlaps without hiding outcomes or overlapping same-target numbers',()=>{
 const cues=Array.from({length:6},(_,i)=>({id:String(i),kind:'DAMAGE',duration:300,cardInstanceId:'target-'+i}));
 assert.deepEqual(presentationBatch(cues),cues.slice(0,4));
 assert.deepEqual(presentationBatch([cues[0],{...cues[1],cardInstanceId:cues[0].cardInstanceId},cues[2]]),[cues[0]]);
 const quest={id:'q',kind:'QUEST_COMPLETE',duration:1500};
 assert.deepEqual(presentationBatch([cues[0],quest,cues[1]]),[cues[0]]);
 assert.deepEqual(presentationBatch([quest,cues[0]]),[quest]);
 assert.deepEqual(presentationBatch([{...quest,kind:'TRANSFORM'},cues[0]]),[{...quest,kind:'TRANSFORM'}]);
});
