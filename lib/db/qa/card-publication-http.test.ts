/** Isolated PostgreSQL-compatible checks; no production connections or mutations. */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { eq } from 'drizzle-orm';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import * as schema from '../src/schema';
process.env.DATABASE_URL='postgresql://unused:unused@127.0.0.1:1/unused';
const pg=new PGlite(),database=drizzle(pg,{schema});
for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await pg.exec(ddl);
await pg.exec(await readFile(new URL('../migrations/0033_server_maintenance.sql',import.meta.url),'utf8'));
const {db,pool}=await import('../src/index');
for(const method of ['select','insert','update','delete','transaction','execute'] as const)Object.assign(db,{[method]:database[method].bind(database)});
const {hashPassword}=await import('../../../artifacts/api-server/src/lib/auth');
const password='IsolatedPublication123';
for(const role of ['ADMIN','USER'])await database.insert(schema.usersTable).values({id:role,email:role.toLowerCase()+'@publication.invalid',nickname:role,passwordHash:await hashPassword(password),role});
const base={cardType:'WRESTLER',rarity:'NORMAL',cost:2,attack:2,health:4,text:'효과 없음',keywords:[],tags:[]};
await database.insert(schema.cardsTable).values([
 {id:'solo-card',name:'공개 상태 검증 선수',status:'PUBLISHED',...base},
 {id:'hidden-card',name:'미공개 검증 선수',status:'DRAFT',...base},
 {id:'inactive-card',name:'비활성 검증 선수',status:'DISABLED',...base},
 {id:'protected-card',name:'참조 보호 검증 선수',status:'PUBLISHED',...base},
 {id:'dependent-card',name:'참조 중인 공개 선수',status:'PUBLISHED',...base,effectConfig:{effects:[{definitionRef:{id:'protected-card'}}]}},
]);
await database.insert(schema.championsTable).values({id:'status-champion',name:'공개 상태 검증 챔피언',abilityName:'검증 능력',abilityEffects:{},status:'PUBLISHED'});
const {default:app}=await import('../../../artifacts/api-server/src/app');
const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));
const address=server.address();assert.ok(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
const cookies:Record<string,string>={};
async function request(path:string,role='',method='GET',body?:unknown){const r=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookies[role]??''},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
for(const role of ['ADMIN','USER']){const r=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:role.toLowerCase()+'@publication.invalid',password})});assert.equal(r.status,200);cookies[role]=r.headers.get('set-cookie')!.split(';')[0]!;}
after(async()=>{if(process.env.KO_PUBLICATION_BROWSER==='1'){await mkdir('qa-results/card-publication',{recursive:true});await writeFile('qa-results/card-publication/fixture.json',JSON.stringify({origin,cookie:cookies.ADMIN}));console.log('PUBLICATION_BROWSER_READY');await new Promise<void>(resolve=>{const timer=setTimeout(resolve,180000);process.once('SIGTERM',()=>{clearTimeout(timer);resolve();});});}await new Promise<void>(resolve=>server.close(()=>resolve()));await pg.close();await pool.end();});
const status=(id:string,value:string,role='ADMIN')=>request('/admin/cards/'+id+'/status',role,'POST',{status:value});
test('publication states round-trip without replacing cards or granting ownership',async()=>{
 const before=(await database.select().from(schema.cardsTable).where(eq(schema.cardsTable.id,'solo-card')))[0]!;
 const collectionsBefore=await database.select().from(schema.userCardCollectionsTable);
 for(const value of ['DRAFT','PUBLISHED','DISABLED','DRAFT','PUBLISHED']){
  const r=await status('solo-card',value);assert.equal(r.status,200);assert.equal(r.body.card.status,value);
  const stored=(await database.select().from(schema.cardsTable).where(eq(schema.cardsTable.id,'solo-card')))[0]!;assert.equal(stored.status,value);
  assert.equal((await request('/cards')).body.cards.some((c:any)=>c.id==='solo-card'),value==='PUBLISHED');
  for(const key of ['id','name','text','cost','attack','health','effectConfig','createdAt'] as const)assert.deepEqual(stored[key],before[key]);
 }
 assert.deepEqual(await database.select().from(schema.userCardCollectionsTable),collectionsBefore);
});
test('ordinary users, anonymous callers and invalid state values cannot alter publication',async()=>{
 assert.equal((await status('solo-card','DRAFT','USER')).status,403);
 assert.equal((await status('solo-card','DRAFT','')).status,401);
 assert.equal((await status('solo-card','INVENTED')).status,400);
 assert.equal((await database.select().from(schema.cardsTable).where(eq(schema.cardsTable.id,'solo-card')))[0]!.status,'PUBLISHED');
});
test('public dependent safety remains enforced when attempting to unpublish',async()=>{
 const r=await status('protected-card','DRAFT');assert.equal(r.status,422);assert.ok(r.body.dependents.some((x:string)=>x.includes('dependent-card')));
 assert.equal((await database.select().from(schema.cardsTable).where(eq(schema.cardsTable.id,'protected-card')))[0]!.status,'PUBLISHED');
});
test('champion uses the same existing unpublished state without changing its ability',async()=>{
 for(const value of ['DRAFT','PUBLISHED']){const r=await request('/admin/champions/status-champion/status','ADMIN','POST',{status:value});assert.equal(r.status,200);assert.equal(r.body.champion.status,value);assert.equal(r.body.champion.abilityName,'검증 능력');}
});
