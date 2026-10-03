import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import * as schema from '../src/schema';
import { EPIC_TECHNIQUES } from '../../../artifacts/ko-game/src/game/cards/epic-techniques';
import { cardRecordToDefinition } from '../../../artifacts/ko-game/src/game/cards/published-cards';
process.env.DATABASE_URL='postgresql://unused:unused@127.0.0.1:1/unused';
const pg=new PGlite();const database=drizzle(pg,{schema});
let admin:typeof import('../../../artifacts/api-server/src/routes/admin');
let original:unknown;
let server: import('node:http').Server;
let origin: string;
let cookie: string;
before(async()=>{
 for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await pg.exec(ddl);
 await database.insert(schema.cardsTable).values({id:'old',name:'원본',cardType:'WRESTLER',rarity:'LEGENDARY',cost:1,attack:2,health:3,text:'보존',status:'PUBLISHED'});
 original=(await database.select().from(schema.cardsTable))[0];
 const migration=await readFile(new URL('../migrations/0039_epic_techniques.sql',import.meta.url),'utf8');await pg.exec(migration);await pg.exec(migration);
 const { db } = await import('../src/index');
 for(const method of ['select','insert','update','delete','transaction','execute'] as const)Object.assign(db,{[method]:database[method].bind(database)});
 await pg.exec(await readFile(new URL('../migrations/0033_server_maintenance.sql',import.meta.url),'utf8'));
 const {hashPassword}=await import('../../../artifacts/api-server/src/lib/auth');
 await database.insert(schema.usersTable).values({id:'epic-qa-admin',email:'epic-qa@example.invalid',nickname:'isolated QA',passwordHash:await hashPassword('IsolatedEpicQA123'),role:'ADMIN',shopCurrencyStarterGrantedAt:new Date()});
 admin=await import('../../../artifacts/api-server/src/routes/admin');
 const {default:app}=await import('../../../artifacts/api-server/src/app');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));const address=server.address();assert.ok(address && typeof address==='object');origin=`http://127.0.0.1:${address.port}`;
 const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'epic-qa@example.invalid',password:'IsolatedEpicQA123'})});assert.equal(login.status,200,await login.text());cookie=login.headers.get('set-cookie')!.split(';')[0];
});
after(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await pg.close();const {pool}=await import('../src/index');await pool.end();});
test('additive migration installs exactly 11 drafts, is idempotent, preserves original',async()=>{
 const rows=await database.select().from(schema.cardsTable);assert.equal(rows.length,12);assert.deepEqual(rows.find(r=>r.id==='old'),original);
});
for(const c of EPIC_TECHNIQUES)test(`${c.name}: DB persistence / serialization / admin save validation`,async()=>{
 const row=(await database.select().from(schema.cardsTable)).find(r=>r.id===c.id)!;assert.ok(row);assert.equal(row.rarity,'EPIC');assert.equal(row.cardType,'TECHNIQUE');assert.equal(row.cost,c.cost);assert.equal(row.text,c.text);assert.equal(row.attack,0);assert.equal(row.health,0);assert.deepEqual(row.effectConfig,c.effectConfig);assert.equal(row.status,'DRAFT');
 const payload=JSON.parse(JSON.stringify(row));assert.ok(admin.parseCardInput(payload),JSON.stringify(payload));const d=cardRecordToDefinition(payload);assert.equal(d.abilities.length,1);assert.equal(d.rarity,'EPIC');
});

test('real HTTP admin EPIC filter, all 11 edit/save/reload, draft privacy and session',async()=>{
 const list=await fetch(origin+'/api/admin/cards?rarity=EPIC&cardType=TECHNIQUE',{headers:{Cookie:cookie}});assert.equal(list.status,200);const body=await list.json() as {cards:typeof EPIC_TECHNIQUES};assert.equal(body.cards.length,11);
 for(const c of body.cards){const save=await fetch(origin+'/api/admin/cards/'+c.id,{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(c)});assert.equal(save.status,200,c.name+': '+await save.text());}
 const reload=await fetch(origin+'/api/admin/cards?rarity=EPIC&cardType=TECHNIQUE',{headers:{Cookie:cookie}});const saved=await reload.json() as {cards:typeof EPIC_TECHNIQUES};for(const c of saved.cards){assert.deepEqual(c.effectConfig,EPIC_TECHNIQUES.find(original=>original.id===c.id)!.effectConfig);assert.equal(c.status,'DRAFT');}
 const publicList=await fetch(origin+'/api/cards');assert.equal(publicList.status,200);const publicBody=await publicList.json() as {cards:typeof EPIC_TECHNIQUES};assert.ok(publicBody.cards.every(c=>!c.id.startsWith('epic-spell-')));
});
