import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {startTutorialFixture,lessonProof} from './tutorial-rewards-fixture.mjs';
let f;
before(async()=>{f=await startTutorialFixture();});after(async()=>{await f?.close();});
const call=(path,body,method='POST',cookie=f.cookie)=>fetch(f.origin+'/api/tutorial'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('status advertises exact 3 per lesson and 1 completion pack; unauthenticated claim rejected',async()=>{
 const s=await (await call('/status',null,'GET')).json();assert.equal(s.ready,true);assert.equal(s.lessonQuantity,3);assert.equal(s.allQuantity,1);assert.equal(s.lessons.length,6);assert.equal(s.lessons.some(l=>l.claimed),false);
 assert.equal((await call('/claim',{lessonId:'basics',complete:true},'POST','')).status,401);
});
test('forged flags, empty/incomplete actions, unknown lessons and another actor grant nothing',async()=>{
 const p=await lessonProof('basics');
 for(const body of [{lessonId:'basics',complete:true},{...p,actions:[]},{...p,actions:p.actions.slice(0,2)},{...p,lessonId:'invented'},{...p,actions:p.actions.map(a=>({...a,playerId:'player-2'}))}])assert.equal((await call('/claim',body)).status,422);
 assert.equal((await f.db.select().from(f.schema.rewardGrantsTable)).length,0);
});
test('same lesson concurrent replay and response retry give exactly three normal packs',async()=>{
 const p=await lessonProof('basics');const replies=await Promise.all(Array.from({length:8},()=>call('/claim',p)));assert.ok(replies.every(r=>r.status===200));
 const rows=await f.db.select().from(f.schema.userPackInventoryTable);assert.equal(rows.find(r=>r.packDefinitionId==='normal-pack').quantity,3);
 assert.equal((await f.db.select().from(f.schema.rewardGrantsTable)).length,1);
});
test('real six lesson replays yield normal packs 18 and one guaranteed champion pack, once',async()=>{
 for(const id of ['combat','rush','spell','active']){const r=await call('/claim',await lessonProof(id));assert.equal(r.status,200,JSON.stringify(await r.json()));}
 const last=await lessonProof('champion');const replies=await Promise.all(Array.from({length:5},()=>call('/claim',last)));assert.ok(replies.every(r=>r.status===200));
 const rows=await f.db.select().from(f.schema.userPackInventoryTable);assert.equal(rows.find(r=>r.packDefinitionId==='normal-pack').quantity,18);assert.equal(rows.find(r=>r.packDefinitionId==='champion-pack').quantity,1);
 assert.equal((await f.db.select().from(f.schema.rewardGrantsTable)).length,7);
 const status=await (await call('/status',null,'GET')).json();assert.ok(status.allClaimed&&status.lessons.every(l=>l.claimed));
 await call('/claim',last);assert.equal((await f.db.select().from(f.schema.rewardGrantsTable)).length,7);
});
test('admin config refuses a mixed pack as guaranteed champion and does not re-grant after config save',async()=>{
 assert.equal((await call('/admin-config',{normalPackId:'normal-pack',championPackId:'normal-pack'},'PATCH')).status,400);
 assert.equal((await call('/admin-config',{normalPackId:'normal-pack',championPackId:'champion-pack'},'PATCH')).status,200);
 assert.equal((await call('/claim',await lessonProof('basics'))).status,200);
 assert.equal((await f.db.select().from(f.schema.rewardGrantsTable)).length,7);
});

test('earned champion pack actually opens as a champion unlock',async()=>{
 const r=await fetch(f.origin+'/api/packs/champion-pack/open',{method:'POST',headers:{Cookie:f.cookie,'Idempotency-Key':'tutorial-earned-champion-open'}});
 const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.rewards.length,1);assert.equal(body.rewards[0].rewardType,'CHAMPION_UNLOCK');assert.equal(body.rewards[0].champion.id,'reward-champion');
});
