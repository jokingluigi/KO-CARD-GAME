import test from 'node:test';import assert from 'node:assert/strict';import {SitePresence} from './site-presence';
test('own identity and duplicate tabs are excluded, other authenticated identities produce only a boolean',()=>{
 const p=new SitePresence(),a:boolean[]=[],a2:boolean[]=[],b:boolean[]=[];
 const leaveA=p.add('a',{send:x=>a.push(x)});const leaveA2=p.add('a',{send:x=>a2.push(x)});assert.deepEqual(a,[false]);assert.deepEqual(a2,[false]);
 const leaveB=p.add('b',{send:x=>b.push(x)});assert.deepEqual(a,[false,true]);assert.deepEqual(b,[true]);
 leaveA();assert.equal(p.hasUser('a'),true);assert.deepEqual(b,[true]);leaveA2();assert.equal(p.hasUser('a'),false);assert.deepEqual(b,[true,false]);leaveA2();assert.deepEqual(b,[true,false]);leaveB();assert.equal(p.hasUser('b'),false);
});
test('adding/removing a third identity does not broadcast unchanged indicators',()=>{
 const p=new SitePresence(),a:boolean[]=[],b:boolean[]=[],c:boolean[]=[];
 p.add('a',{send:x=>a.push(x)});p.add('b',{send:x=>b.push(x)});const leave=p.add('c',{send:x=>c.push(x)});assert.deepEqual(a,[false,true]);assert.deepEqual(b,[true]);assert.deepEqual(c,[true]);leave();assert.deepEqual(a,[false,true]);
});
test('reconnect creates a fresh initial snapshot instead of a stale online indicator',()=>{
 const p=new SitePresence();const old:boolean[]=[],fresh:boolean[]=[];const leave=p.add('a',{send:x=>old.push(x)});leave();p.add('a',{send:x=>fresh.push(x)});assert.deepEqual(fresh,[false]);
});
