import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';
import * as schema from '../src/schema';

process.env.DATABASE_URL='postgresql://unused:unused@127.0.0.1:1/unused';
const pg=new PGlite(),database=drizzle(pg,{schema});
let server:import('node:http').Server,origin:string,cookie:string,cookieB:string;
before(async()=>{
 for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await pg.exec(ddl);
 await pg.exec(await readFile(new URL('../migrations/0033_server_maintenance.sql',import.meta.url),'utf8'));
 const {db}=await import('../src/index');for(const method of ['select','insert','update','delete','transaction','execute'] as const)Object.assign(db,{[method]:database[method].bind(database)});
 const {hashPassword}=await import('../../../artifacts/api-server/src/lib/auth');
 await database.insert(schema.usersTable).values({id:'bulk-shop-qa',email:'bulk-shop@example.invalid',nickname:'QA',passwordHash:await hashPassword('IsolatedShopQA123'),role:'USER',currencyBalance:2000,shopCurrencyStarterGrantedAt:new Date()});
 await database.insert(schema.cardsTable).values({id:'pack-card',name:'Receipt Fighter',cardType:'WRESTLER',cost:1,attack:1,health:1,text:'',rarity:'NORMAL',status:'PUBLISHED'});
 await database.insert(schema.usersTable).values({id:'pack-user-b',email:'pack-b@example.invalid',nickname:'User B',passwordHash:await hashPassword('IsolatedPackQA123'),role:'USER',currencyBalance:0,shopCurrencyStarterGrantedAt:new Date()});
 await database.insert(schema.packDefinitionsTable).values({id:'pack',name:'Receipt Pack',status:'PUBLISHED',cardsPerPack:2,normalRate:100,epicRate:0,legendaryRate:0,championRate:0,normalCardPool:['pack-card']});
 await database.insert(schema.userPackInventoryTable).values({userId:'bulk-shop-qa',packDefinitionId:'pack',quantity:3});
 await database.insert(schema.userCardCollectionsTable).values({userId:'bulk-shop-qa',cardDefinitionId:'pack-card',quantity:2});
 await database.insert(schema.shopListingsTable).values({id:'listing',packDefinitionId:'pack',quantity:2,price:100});
 const {default:app}=await import('../../../artifacts/api-server/src/app');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));const addr=server.address();assert.ok(addr&&typeof addr==='object');origin=`http://127.0.0.1:${addr.port}`;
 const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'bulk-shop@example.invalid',password:'IsolatedShopQA123'})});assert.equal(login.status,200);cookie=login.headers.get('set-cookie')!.split(';')[0];
 const loginB=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'pack-b@example.invalid',password:'IsolatedPackQA123'})});assert.equal(loginB.status,200);cookieB=loginB.headers.get('set-cookie')!.split(';')[0];

});
after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await pg.close();const {pool}=await import('../src/index');await pool.end();});

const open=(key:string)=>fetch(origin+'/api/packs/pack/open',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({})});
test('real normal-user pack receipt stores exact duplicate ownership and retry grants no extra cards',async()=>{const first=await open('receipt-1');assert.equal(first.status,200);const result=await first.json();assert.deepEqual(result.rewards.map((r:{ownedBefore:number;ownedAfter:number})=>[r.ownedBefore,r.ownedAfter]),[[2,3],[3,4]]);assert.equal((await database.select().from(schema.userCardCollectionsTable))[0].quantity,4);assert.equal((await database.select().from(schema.userPackInventoryTable))[0].quantity,2);const retry=await open('receipt-1');assert.equal(retry.status,200);assert.deepEqual((await retry.json()).rewards,result.rewards);assert.equal((await database.select().from(schema.userCardCollectionsTable))[0].quantity,4);assert.equal((await database.select().from(schema.packOpeningClaimsTable)).length,1);});
test('fresh request grants next actual count; user B and anonymous sessions cannot inherit receipt',async()=>{const next=await open('receipt-2');assert.equal(next.status,200);assert.deepEqual((await next.json()).rewards.map((r:{ownedBefore:number;ownedAfter:number})=>[r.ownedBefore,r.ownedAfter]),[[4,5],[5,6]]);const other=await fetch(origin+'/api/packs/pack/open',{method:'POST',headers:{Cookie:cookieB,'Content-Type':'application/json','Idempotency-Key':'receipt-1'},body:'{}'});assert.equal(other.status,422);const anonymous=await fetch(origin+'/api/packs/pack/open',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'receipt-1'},body:'{}'});assert.equal(anonymous.status,401);assert.equal((await database.select().from(schema.userCardCollectionsTable))[0].quantity,6);});
