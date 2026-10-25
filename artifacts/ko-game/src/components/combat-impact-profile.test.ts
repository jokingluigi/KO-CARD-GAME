import test from 'node:test';
import assert from 'node:assert/strict';
import {combatImpactProfile} from './combat-impact-profile';
import {attackFrames,combatTimeline} from './battle-vfx-model';
test('blocked and mitigated attacks do not imply heavy damage',()=>{
 assert.equal(combatImpactProfile(99,0,true).tier,'BLOCK');
 assert.equal(combatImpactProfile(99,1).tier,'LIGHT');
 assert.equal(combatImpactProfile(1,10).tier,'MASSIVE');
});
test('all profiles leave recovery time and ordered frames',()=>{
 for(const attack of [0,1,3,6,100,NaN])for(const damage of [0,1,3,6,10,100,NaN])for(const finish of [false,true]){
  const p=combatImpactProfile(attack,damage,finish);
  assert.ok(p.contact+p.hitstop<p.duration*.82);
  const frames=attackFrames(2400,-1200,combatTimeline(attack,damage,finish));
  const offsets=frames.map(f=>f.offset);assert.deepEqual(offsets,[...offsets].sort((a,b)=>Number(a)-Number(b)));
 }
});
