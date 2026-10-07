import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../src/schema";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AWAKENING_CARD_IDS,
  AWAKENING_QUEST_TEXT,
  championRecordToDefinition,
  cardRecordToDefinition,
  createInitialGameState,
  generateCardInstance,
} from "../../game-engine/src";
import { applyEffect } from "../../../artifacts/ko-game/src/game/effects/effect-engine";
import { sanitizeGameStateForViewer } from "../../../artifacts/api-server/src/online/sanitizer";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.NODE_ENV = "development";
const pg = new PGlite(),
  database = drizzle(pg, { schema });
for (const ddl of await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson(schema),
))
  await pg.exec(ddl);
await pg.exec(
  await readFile(
    new URL("../migrations/0033_server_maintenance.sql", import.meta.url),
    "utf8",
  ),
);
await pg.exec(await readFile(new URL("../migrations/0038_ai_quest_matches.sql", import.meta.url), "utf8"));
await pg.exec(await readFile(new URL("../migrations/0038_ai_quest_matches.sql", import.meta.url), "utf8"));
const { db, pool } = await import("../src/index");
for (const method of [
  "select",
  "insert",
  "update",
  "delete",
  "transaction",
  "execute",
] as const)
  Object.assign(db, { [method]: database[method].bind(database) });
const { hashPassword } =
  await import("../../../artifacts/api-server/src/lib/auth");
await database.insert(schema.usersTable).values({
  id: "feature-admin",
  email: "admin@feature.invalid",
  nickname: "Awakening QA",
  passwordHash: await hashPassword("AwakeningLocalQA123"),
  role: "ADMIN",
});
const { default: app } = await import("../../../artifacts/api-server/src/app");
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.on("listening", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const origin = `http://127.0.0.1:${address.port}`;
let cookie = "",
  id = "",
  record: any;
async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(origin + "/api" + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const session = response.headers.get("set-cookie");
  if (session) cookie = session.split(";")[0];
  return { status: response.status, body: await response.json() };
}

after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await pg.close();await pool.end();});
const cardInput={name:'Tagged wrestler',cardType:'WRESTLER',rarity:'NORMAL',cost:2,attack:3,health:4,text:'preserve text',keywords:[],tags:['기존 태그'],isToken:false,isChampionToken:false,effectId:null,effectConfig:{keep:true}};
let card:any,technique:any;
test('tag administration requires admin and keeps empty tags',async()=>{
 assert.equal((await request('/admin/tags')).status,401);
 assert.equal((await request('/auth/login','POST',{email:'admin@feature.invalid',password:'AwakeningLocalQA123'})).status,200);
 assert.equal((await request('/admin/tags','POST',{name:'  동료 / A  '})).status,201);
 assert.equal((await request('/admin/tags','POST',{name:'동료 / A'})).status,200);
 assert.ok((await request('/admin/tags')).body.tags.includes('동료 / A'));
 assert.equal((await request('/admin/tags','POST',{name:' '})).status,400);
 const created=await request('/admin/cards','POST',cardInput);assert.equal(created.status,201,JSON.stringify(created.body));card=created.body.card;
 const spell=await request('/admin/cards','POST',{...cardInput,name:'Spell',cardType:'TECHNIQUE',attack:0,health:0});assert.equal(spell.status,201);technique=spell.body.card;
 const list=await request('/admin/tags');assert.ok(list.body.tags.includes('기존 태그'));assert.ok(list.body.cards.some((c:any)=>c.id===card.id));assert.ok(!list.body.cards.some((c:any)=>c.id===technique.id));
});
test('tag attach/detach is idempotent and preserves card effects, stats and other tags',async()=>{
 const path='/admin/tags/'+encodeURIComponent('동료 / A')+'/cards/'+card.id;
 const add=await request(path,'PATCH',{attached:true});assert.equal(add.status,200,JSON.stringify(add.body));assert.deepEqual(add.body.card.tags,['기존 태그','동료 / A']);const version=add.body.card.version;
 const duplicate=await request(path,'PATCH',{attached:true});assert.equal(duplicate.body.card.version,version);assert.deepEqual(duplicate.body.card.tags,add.body.card.tags);
 const remove=await request(path,'PATCH',{attached:false});assert.deepEqual(remove.body.card.tags,['기존 태그']);assert.ok((await request('/admin/tags')).body.tags.includes('동료 / A'));
 for(const field of ['cost','attack','health','text','effectConfig','status'])assert.deepEqual(remove.body.card[field],card[field]);
 assert.equal((await request('/admin/tags/'+encodeURIComponent('동료 / A')+'/cards/'+technique.id,'PATCH',{attached:true})).status,404);
 assert.equal((await request(path,'PATCH',{attached:'yes'})).status,400);
 assert.equal((await request('/admin/tags/missing/cards/'+card.id,'PATCH',{attached:true})).status,404);
});
test('different tags can be attached concurrently without losing either',async()=>{
 for(const name of ['하나','둘'])await request('/admin/tags','POST',{name});
 const added=await Promise.all(['하나','둘'].map(name=>request('/admin/tags/'+encodeURIComponent(name)+'/cards/'+card.id,'PATCH',{attached:true})));for(const result of added)assert.equal(result.status,200);
 const got=(await request('/admin/tags')).body.cards.find((c:any)=>c.id===card.id);assert.ok(got.tags.includes('하나')&&got.tags.includes('둘')&&got.tags.includes('기존 태그'));
});
test('card creation and editing support more than three tags',async()=>{
 const tags=Array.from({length:20},(_,i)=>'태그 '+i);const created=await request('/admin/cards','POST',{...cardInput,name:'Many tags',tags});assert.equal(created.status,201,JSON.stringify(created.body));assert.deepEqual(created.body.card.tags,tags);
 const updated=await request('/admin/cards/'+created.body.card.id,'PATCH',{...cardInput,name:'Many tags',tags:[...tags,'추가 태그']});assert.equal(updated.status,200);assert.equal(updated.body.card.tags.length,21);
 const {availableCardTags}=await import('../../../artifacts/api-server/src/lib/card-tag-catalog');assert.ok((await availableCardTags()).includes('추가 태그'));
 for(const bad of [['중복','중복'],['빈칸',' ']])assert.equal((await request('/admin/cards/'+created.body.card.id,'PATCH',{...cardInput,tags:bad})).status,400);
});
test('deleting a tag removes that tag from cards without deleting cards or other tags',async()=>{
 const deleted=await request('/admin/tags/'+encodeURIComponent('기존 태그'),'DELETE');assert.equal(deleted.status,200);assert.equal(deleted.body.affectedCards,2);
 const cards=(await request('/admin/cards')).body.cards;for(const id of [card.id,technique.id])assert.ok(cards.some((c:any)=>c.id===id&&!c.tags.includes('기존 태그')));
 const tagged=cards.find((c:any)=>c.id===card.id);assert.ok(tagged.tags.includes('하나')&&tagged.tags.includes('둘'));assert.deepEqual(tagged.effectConfig,cardInput.effectConfig);
 assert.ok(!(await request('/admin/tags')).body.tags.includes('기존 태그'));
 assert.equal((await request('/admin/tags/'+encodeURIComponent('기존 태그'),'DELETE')).status,404);
});
test('ordinary user cannot change tag catalog or memberships',async()=>{
 await database.insert(schema.usersTable).values({id:'tag-user',email:'user@tags.invalid',nickname:'User',passwordHash:await hashPassword('TagUserPassword123'),role:'USER'});
 const adminCookie=cookie;cookie='';assert.equal((await request('/auth/login','POST',{email:'user@tags.invalid',password:'TagUserPassword123'})).status,200);
 assert.equal((await request('/admin/tags')).status,403);assert.equal((await request('/admin/tags','POST',{name:'blocked'})).status,403);
 assert.equal((await request('/admin/tags/'+encodeURIComponent('하나')+'/cards/'+card.id,'PATCH',{attached:false})).status,403);
 assert.equal((await request('/admin/tags/'+encodeURIComponent('하나'),'DELETE')).status,403);cookie=adminCookie;
});
test('additive tag migration backfills legacy tags and is safe to repeat',async()=>{
 const legacy=new PGlite();try{await legacy.exec("CREATE TABLE cards(id text PRIMARY KEY,tags text[],cost int); INSERT INTO cards VALUES('old',ARRAY[' 옛 태그 ','옛 태그','다른 태그'],4);");
 const migration=await readFile(new URL('../migrations/0049_card_tag_catalog.sql',import.meta.url),'utf8');await legacy.exec(migration);await legacy.exec(migration);
 assert.deepEqual((await legacy.query('SELECT name FROM card_tags ORDER BY name')).rows,[{name:'다른 태그'},{name:'옛 태그'}]);assert.deepEqual((await legacy.query('SELECT tags,cost FROM cards')).rows,[{tags:[' 옛 태그 ','옛 태그','다른 태그'],cost:4}]);}finally{await legacy.close();}
});

test('legacy whitespace tags can be detached and deleted without resurfacing',async()=>{
 await database.update(schema.cardsTable).set({tags:[' 옛 태그 ','기타']}).where((await import('drizzle-orm')).eq(schema.cardsTable.id,card.id));
 const list=await request('/admin/tags');assert.ok(list.body.cards.find((c:any)=>c.id===card.id).tags.includes('옛 태그'));
 const attached=await request('/admin/tags/'+encodeURIComponent('옛 태그')+'/cards/'+card.id,'PATCH',{attached:true});assert.equal(attached.status,200);assert.equal(attached.body.card.tags.length,2);
 const deleted=await request('/admin/tags/'+encodeURIComponent('옛 태그'),'DELETE');assert.equal(deleted.status,200);assert.equal(deleted.body.affectedCards,1);
 const after=await request('/admin/tags');assert.ok(!after.body.tags.includes('옛 태그'));assert.deepEqual(after.body.cards.find((c:any)=>c.id===card.id).tags,['기타']);
});
