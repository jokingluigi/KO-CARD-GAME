// Local-only, isolated PostgreSQL fixture for EPIC HTTP and browser verification.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import * as schema from '../src/schema';
import {readFile} from 'node:fs/promises';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL='postgresql://unused:unused@127.0.0.1:1/unused';
process.env.NODE_ENV='development';
const pg=new PGlite();const database=drizzle(pg,{schema});
for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await pg.exec(ddl);
await pg.exec(await readFile(new URL('../migrations/0033_server_maintenance.sql',import.meta.url),'utf8'));
const {db}=await import('../src/index');
for(const method of ['select','insert','update','delete','transaction','execute'] as const)Object.assign(db,{[method]:database[method].bind(database)});
const {hashPassword}=await import('../../../artifacts/api-server/src/lib/auth');
await database.insert(schema.usersTable).values(['admin','user','opponent'].map(id=>({id,email:`${id}@epic.invalid`,nickname:`EPIC ${id}`,passwordHash:'placeholder',role:id==='admin'?'ADMIN' as const:'USER' as const,currencyBalance:1000,shopCurrencyStarterGrantedAt:new Date()})));
await database.update(schema.usersTable).set({passwordHash:await hashPassword('EpicLocalQA123')});
const cards=[...Array.from({length:10},(_,i)=>({id:`n${i}`,rarity:'NORMAL'})),...Array.from({length:12},(_,i)=>({id:`e${i}`,rarity:'EPIC'})),...Array.from({length:4},(_,i)=>({id:`l${i}`,rarity:'LEGENDARY'}))].map(c=>({...c,name:`${c.rarity} ${c.id}`,cardType:'WRESTLER',cost:1,attack:2,health:3,text:'검증용 카드',status:'PUBLISHED'}));
await database.insert(schema.cardsTable).values(cards);
await database.insert(schema.championsTable).values({id:'hero',name:'QA Champion',abilityName:'응원',abilityText:'체력을 1 회복합니다.',abilityCost:1,abilityEffects:{type:'HEAL_SELF',amount:1},maxHealth:30,status:'PUBLISHED'});
await database.insert(schema.championsTable).values({id:'rival',name:'QA Rival',abilityName:'응원',abilityText:'체력을 1 회복합니다.',abilityCost:1,abilityEffects:{type:'HEAL_SELF',amount:1},maxHealth:30,status:'PUBLISHED'});
for(const userId of ['user','opponent']){
 await database.insert(schema.userCardCollectionsTable).values(cards.map(c=>({userId,cardDefinitionId:c.id,quantity:4})));
 await database.insert(schema.userChampionCollectionsTable).values({userId,championDefinitionId:'hero',owned:true});
}
const cardIds=['e0','e0','e1','e1','l0','l1','l2',...Array.from({length:18},(_,i)=>`n${Math.floor(i/3)}`)];
await database.insert(schema.decksTable).values(['user','admin','opponent'].map(userId=>({id:`${userId}-deck`,userId,name:'EPIC 혼합 덱',championDefinitionId:'hero',cardDefinitionIds:cardIds,isSelected:true})));
await database.insert(schema.aiDecksTable).values({id:'ai',name:'EPIC AI',championDefinitionId:'hero',cardDefinitionIds:cardIds,enabled:true});
await database.insert(schema.packDefinitionsTable).values({id:'pack',name:'EPIC QA Pack',normalRate:0,epicRate:100,legendaryRate:0,championRate:0,epicCardPool:['e0'],status:'PUBLISHED'});
await database.insert(schema.userPackInventoryTable).values({userId:'user',packDefinitionId:'pack',quantity:5});
const {default:app}=await import('../../../artifacts/api-server/src/app');

const server=app.listen(0,'127.0.0.1');
await new Promise<void>(resolve=>server.on('listening',resolve));
const address=server.address();assert.ok(address&&typeof address==='object');
const origin=`http://127.0.0.1:${address.port}`;
const cookies=new Map<string,string>();
const matches:string[]=[];
async function request(role:string,path:string,method='GET',body?:unknown,key?:string){
 const response=await fetch(`${origin}/api${path}`,{method,headers:{'Content-Type':'application/json',...(cookies.has(role)?{Cookie:cookies.get(role)!}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const cookie=response.headers.get('set-cookie');if(cookie)cookies.set(role,cookie.split(';')[0]);
 return {status:response.status,body:await response.json()};
}
after(async()=>{const {getRuntime,cleanupMatchRuntime}=await import('../../../artifacts/api-server/src/online/service');for(const id of matches){const runtime=await getRuntime(id);if(runtime){await runtime.queue;runtime.state={...runtime.state,status:'FINISHED'};cleanupMatchRuntime(id);}}await new Promise<void>(resolve=>server.close(()=>resolve()));await pg.close();const {pool}=await import('../src/index');await pool.end();});
test('HTTP login/session and EPIC collection/options serialize correctly',async()=>{
 for(const role of ['admin','user','opponent'])assert.equal((await request(role,'/auth/login','POST',{email:`${role}@epic.invalid`,password:'EpicLocalQA123'})).status,200);
 const session=await request('user','/auth/me');assert.equal(session.status,200);assert.equal(session.body.user.role,'USER');
 const result=await request('user','/collection');assert.equal(result.status,200);assert.ok(result.body.cards.some((c:any)=>c.rarity==='EPIC'&&c.quantity===4));
 assert.ok((await request('user','/decks/options')).body.cards.some((c:any)=>c.rarity==='EPIC'));
});
const pad=(ids:string[])=>[...ids,...Array.from({length:25-ids.length},(_,i)=>`n${Math.floor(i/3)}`)];
for(const [id,limit] of [['n9',3],['e0',2],['l0',1]] as const){
 for(let count=1;count<=limit+1;count++)test(`HTTP deck POST/PATCH ${id} x${count}`,async()=>{
  const payload={name:'HTTP test',championDefinitionId:'hero',cardDefinitionIds:pad(Array(count).fill(id))};
  const result=await request('user','/decks','POST',payload);assert.equal(result.status,count<=limit?201:400);
  const update=await request('user','/decks/user-deck','PATCH',payload);assert.equal(update.status,count<=limit?200:400);
  if(count>limit){assert.match(result.body.message,/최대/);assert.ok(!result.body.message.includes('[object Object]'));}
 });
}
test('HTTP legend totals, mixed save/load, unauthorized calls and direct bypass rejected',async()=>{
 for(let count=1;count<=4;count++){
  const result=await request('user','/decks','POST',{name:'Legendaries',championDefinitionId:'hero',cardDefinitionIds:pad(Array.from({length:count},(_,i)=>`l${i}`))});
  assert.equal(result.status,count<=3?201:400);
 }
 const result=await request('user','/decks/user-deck','PATCH',{name:'Mixed',championDefinitionId:'hero',cardDefinitionIds:cardIds});assert.equal(result.status,200);assert.equal(result.body.deck.isValid,true);
 const loaded=await request('user','/decks');assert.deepEqual(loaded.body.decks.find((d:any)=>d.id==='user-deck').cardDefinitionIds,cardIds);
 assert.equal((await request('anonymous','/decks','POST',{name:'Bypass',cardDefinitionIds:cardIds})).status,401);
});
test('HTTP Admin EPIC create/edit/relogin/read and non-admin denial',async()=>{
 const input={name:'HTTP EPIC',cardType:'WRESTLER',rarity:'EPIC',cost:1,attack:2,health:3,text:'',keywords:[],tags:[],isToken:false,isChampionToken:false,effectConfig:{}};
 assert.equal((await request('user','/admin/cards','POST',input)).status,403);
 const created=await request('admin','/admin/cards','POST',input);assert.equal(created.status,201);assert.equal(created.body.card.rarity,'EPIC');
 const id=created.body.card.id;
 assert.equal((await request('admin',`/admin/cards/${id}`,'PATCH',{...input,name:'Edited EPIC'})).status,200);
 assert.equal((await request('admin','/auth/login','POST',{email:'admin@epic.invalid',password:'EpicLocalQA123'})).status,200);
 const loaded=await request('admin','/admin/cards?rarity=EPIC');assert.ok(loaded.body.cards.some((c:any)=>c.id===id&&c.rarity==='EPIC'&&c.name==='Edited EPIC'));
});
test('HTTP EPIC pack grant and retry are atomic/idempotent',async()=>{
 const first=await request('user','/packs/pack/open','POST',undefined,'epic-once');assert.equal(first.status,200);assert.equal(first.body.rewards[0].rewardType,'EPIC_CARD');
 const retry=await request('user','/packs/pack/open','POST',undefined,'epic-once');assert.equal(retry.status,200);assert.deepEqual(retry.body,first.body);
 const owned=await request('user','/collection');assert.equal(owned.body.cards.find((c:any)=>c.id==='e0').quantity,5);
});
test('HTTP AI deck and PvP match creation/join accept EPIC catalog',async()=>{
 const ai=await request('user','/ai-decks');assert.equal(ai.status,200);assert.ok(ai.body.decks[0].cards.some((c:any)=>c.rarity==='EPIC'));
 const created=await request('user','/online-matches','POST',{deckId:'user-deck'});assert.equal(created.status,201);matches.push(created.body.match.id);
 const joined=await request('opponent',`/online-matches/${created.body.match.id}/join`,'POST',{deckId:'opponent-deck'});assert.equal(joined.status,201);
 assert.ok(JSON.stringify(joined.body).includes('EPIC'));
});

test('HTTP Admin EPIC pack configuration, publication and forced preview persist',async()=>{
 const input={name:'Configured EPIC',cardsPerPack:1,normalRate:0,epicRate:100,legendaryRate:0,championRate:0,skinChance:0,normalCardPool:[],epicCardPool:['e0'],legendaryCardPool:[],championPool:[],skinPool:[]};
 const created=await request('admin','/admin/packs','POST',input);assert.equal(created.status,201);assert.deepEqual(created.body.validationErrors,[]);
 const id=created.body.pack.id;
 assert.equal((await request('admin',`/admin/packs/${id}/status`,'POST',{status:'PUBLISHED'})).status,200);
 const preview=await request('admin',`/admin/packs/${id}/preview/forced`,'POST',{slots:[{type:'EPIC_CARD',id:'e0'}]});assert.equal(preview.status,200);assert.equal(preview.body.rewards[0].card.rarity,'EPIC');
 const view=await request('user',`/packs/${id}/details`);assert.equal(view.status,200);assert.equal(view.body.details.epicCards[0].rarity,'EPIC');
});
process.env.KO_QA_API_ORIGIN=origin;
process.env.KO_AI_QA_REPORT='/tmp/epic-ai-match-qa.md';
await import('../../../artifacts/ko-game/src/game/qa/ai-match-qa.test');
