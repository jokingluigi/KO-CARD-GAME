import test from 'node:test';import assert from 'node:assert/strict';
import {withoutQuestCompletions,emptyCinematicState,offerCinematic,finishCinematic,cinematicDuration,cameraLevel,type CinematicEvent,type CinematicKind} from './cinematic-policy';
const event=(id:string,kind:CinematicKind,createdAt=0):CinematicEvent=>({id,kind,createdAt,title:id,duration:400});
test('finite camera levels separate ordinary, heavy, cinematic and finisher',()=>{assert.equal(cameraLevel(event('a','ATTACK')),1);assert.equal(cameraLevel({...event('a','ATTACK'),strength:10}),2);assert.equal(cameraLevel(event('a','LEGENDARY')),3);assert.equal(cameraLevel(event('a','FINISHER')),4);});
test('queue deduplicates network replay without restarting active scene',()=>{const s=offerCinematic(emptyCinematicState(),event('q','AWAKENING'));assert.equal(offerCinematic(s,event('q','AWAKENING')),s);});
test('finisher preempts lower scenes, stale completion cannot end finisher',()=>{let s=offerCinematic(emptyCinematicState(),event('q','AWAKENING'));s=offerCinematic(s,event('f','FINISHER'));assert.equal(s.active?.id,'f');assert.equal(finishCinematic(s,'q',100),s);});
test('important queue uses priority and preserves equal-priority order',()=>{let s=offerCinematic(emptyCinematicState(),event('a','ABILITY'));for(const [id,kind] of [['l','LEGENDARY'],['q','AWAKENING'],['l2','LEGENDARY']] as const)s=offerCinematic(s,event(id,kind,10));s=finishCinematic(s,'a',100);assert.equal(s.active?.id,'q');s=finishCinematic(s,'q',200);assert.equal(s.active?.id,'l');});
test('minor combat is suppressed behind cut-ins rather than replayed late',()=>{let s=offerCinematic(emptyCinematicState(),event('q','AWAKENING'));s=offerCinematic(s,event('a','ATTACK'));assert.equal(s.pending.length,0);assert.ok(s.seen.includes('a'));});
test('burst queue and dedup memory are bounded; expired scenes are discarded',()=>{let s=emptyCinematicState();for(let i=0;i<130;i++)s=offerCinematic(s,event(String(i),'ABILITY',i));assert.ok(s.pending.length<=6);assert.equal(s.seen.length,96);s=finishCinematic(s,'0',2200);assert.equal(s.active,null);assert.equal(s.pending.length,0);});
test('fast, reduced and queue pressure durations remain bounded',()=>{assert.equal(cinematicDuration(event('b','BOSS'),true),160);assert.equal(cinematicDuration({...event('b','BOSS'),duration:1500},false,'FAST'),1050);assert.equal(cinematicDuration({...event('a','ABILITY'),duration:100000}),1500);assert.ok(cinematicDuration(event('a','ABILITY'),false,'NORMAL',5)>=140);});

test('defeat cancels active and queued quest scenes while preserving unrelated awakening and results',()=>{
 const quest={...event('quest','AWAKENING'),questCompletion:true};
 const other=event('other','AWAKENING');const result=event('result','RESULT');
 const s={active:quest,pending:[{...quest,id:'queued-quest'},other,result],seen:['quest']};
 const n=withoutQuestCompletions(s);assert.equal(n.active,other);assert.deepEqual(n.pending,[result]);assert.deepEqual(n.seen,s.seen);
 const finished={active:result,pending:[quest,other],seen:[]};const kept=withoutQuestCompletions(finished);assert.equal(kept.active,result);assert.deepEqual(kept.pending,[other]);
 assert.equal(withoutQuestCompletions({active:other,pending:[],seen:[]}).active,other);
});
