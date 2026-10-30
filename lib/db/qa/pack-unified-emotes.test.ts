/** Isolated PGlite only. Does not connect to production. */
import './ai-deck-cosmetics.test';
import assert from 'node:assert/strict';import {test} from 'node:test';import {readFile} from 'node:fs/promises';
import {database,pg,api,cards,deck,origin,cookies,uploaded} from './cosmetics.test';
import * as schema from '../src/schema';import {eq,and} from 'drizzle-orm';
import {rollPack} from '../../../artifacts/api-server/src/routes/collection';
import {cosmeticImage} from '../../cosmetics/src/index';
const base={name:'통합 확률 QA',cardsPerPack:1,normalRate:0,epicRate:0,legendaryRate:0,championRate:0,skinChance:0,emoteRate:100,emotePool:['roll-emote'],normalCardPool:[],epicCardPool:[],legendaryCardPool:[],championPool:[],skinPool:[]};
let packId='';
async function open(key:string,bulk=false){const r=await fetch(`${origin}/api/packs/${packId}/${bulk?'open-bulk':'open'}`,{method:'POST',headers:{cookie:cookies['player-b']!,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(bulk?{quantity:2}:{})});return {status:r.status,body:await r.json()};}
test('emote schema migration is repeatable and does not rewrite old odds/inventory',async()=>{
 const before=await database.select().from(schema.packDefinitionsTable);const sql=await readFile(new URL('../migrations/0056_pack_emote_rates.sql',import.meta.url),'utf8');await pg.exec(sql);await pg.exec(sql);assert.deepEqual(await database.select().from(schema.packDefinitionsTable),before);
 await database.insert(schema.cosmeticItemsTable).values({id:'roll-emote',type:'IMAGE_EMOTE',name:'통합 확률 이모티콘',imageAssets:{art:uploaded},isActive:true});
 const options=await api('/admin/packs/options');assert.ok(options.body.emotes.some((e:any)=>e.id==='roll-emote'));
});
test('admin config validates six rates, active emote types and forced preview without granting inventory',async()=>{
 assert.equal((await api('/admin/packs','player-b','POST',base)).status,403);
 const r=await api('/admin/packs','admin','POST',base);assert.equal(r.status,201,JSON.stringify(r.body));packId=r.body.pack.id;assert.deepEqual(r.body.validationErrors,[]);
 assert.equal((await api(`/admin/packs/${packId}/status`,'admin','POST',{status:'PUBLISHED'})).status,200);
 const details=(await api(`/packs/${packId}/details`,'player-b')).body.details;assert.equal(details.valid,true);assert.equal(details.emotes[0].individualProbability,100);
 const before=await database.select().from(schema.userCosmeticsTable);
 const forced=await api(`/admin/packs/${packId}/preview/forced`,'admin','POST',{slots:[{type:'IMAGE_EMOTE',id:'roll-emote'}]});assert.equal(forced.status,200);assert.equal(forced.body.rewards[0].rewardType,'IMAGE_EMOTE');assert.deepEqual(await database.select().from(schema.userCosmeticsTable),before);
 assert.equal((await api(`/admin/packs/${packId}`,'admin','PATCH',{...base,normalRate:1})).status,422);
 assert.equal((await api('/admin/packs','admin','POST',{...base,emoteRate:0.5})).status,400);
 assert.equal((await api('/admin/packs','admin','POST',{...base,emotePool:['not-real']})).status,422);
 const invalid=await api('/admin/packs','admin','POST',{...base,emotePool:[]});assert.equal(invalid.status,201);assert.equal((await api(`/admin/packs/${invalid.body.pack.id}/status`,'admin','POST',{status:'PUBLISHED'})).status,422);
 assert.equal((await api(`/admin/cosmetics/items/roll-emote`,'admin','DELETE')).status,409);
});
test('real single/bulk openings award emotes once, replay exact claims and preserve duplicate semantics',async()=>{
 await database.insert(schema.userPackInventoryTable).values({userId:'player-b',packDefinitionId:packId,quantity:4});
 const first=await open('emote-once');assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.rewards[0].rewardType,'IMAGE_EMOTE');assert.equal(first.body.rewards[0].alreadyOwned,false);
 assert.deepEqual((await open('emote-once')).body,first.body);
 const bulk=await open('emote-bulk',true);assert.equal(bulk.status,200,JSON.stringify(bulk.body));assert.equal(bulk.body.openings.length,2);assert.ok(bulk.body.openings.every((o:any)=>o.rewards[0].alreadyOwned===true));assert.deepEqual((await open('emote-bulk',true)).body,bulk.body);
 const owned=await database.select().from(schema.userCosmeticsTable).where(and(eq(schema.userCosmeticsTable.userId,'player-b'),eq(schema.userCosmeticsTable.cosmeticId,'roll-emote')));assert.equal(owned.length,1);
 assert.equal((await database.select().from(schema.userPackInventoryTable).where(eq(schema.userPackInventoryTable.packDefinitionId,packId)))[0].quantity,1);
});
test('invalid sums and empty/disabled emote pools roll back inventory and claims',async()=>{
 await database.update(schema.packDefinitionsTable).set({normalRate:1}).where(eq(schema.packDefinitionsTable.id,packId));assert.notEqual((await open('bad-sum')).status,200);
 await database.update(schema.packDefinitionsTable).set({normalRate:0}).where(eq(schema.packDefinitionsTable.id,packId));await database.update(schema.cosmeticItemsTable).set({isActive:false}).where(eq(schema.cosmeticItemsTable.id,'roll-emote'));assert.notEqual((await open('bad-pool')).status,200);
 assert.equal((await database.select().from(schema.userPackInventoryTable).where(eq(schema.userPackInventoryTable.packDefinitionId,packId)))[0].quantity,1);assert.equal((await database.select().from(schema.packOpeningClaimsTable).where(eq(schema.packOpeningClaimsTable.idempotencyKey,'bad-pool'))).length,0);
 await database.update(schema.cosmeticItemsTable).set({isActive:true}).where(eq(schema.cosmeticItemsTable.id,'roll-emote'));
});
test('skin and card categories share the same roller; 100% skin has no underlying grade requirement',async()=>{
 const [skin]=await database.insert(schema.cardSkinDefinitionsTable).values({id:'unified-card-skin',cardDefinitionId:cards[0].id,name:'통합 스킨',status:'PUBLISHED',imageUrl:uploaded}).returning();
 const [pack]=await database.insert(schema.packDefinitionsTable).values({...base,id:'unified-skin',skinChance:100,emoteRate:0,skinPool:[skin.id]}).returning();
 const rewards=await rollPack(pack,database as any);assert.equal(rewards.length,1);assert.equal(rewards[0].rewardType,'SKIN');
});
test('AI unowned legacy card skins appear, save with champion skin, survive reload and do not grant player ownership',async()=>{
 const legacy='ai-unowned-legacy';await database.insert(schema.cardSkinDefinitionsTable).values({id:legacy,cardDefinitionId:cards[0].id,name:'미소유 AI 선수 스킨',status:'PUBLISHED',imageUrl:uploaded});
 const options=await api('/admin/ai-decks/options');assert.equal(options.body.aiCosmeticsAvailable,true);assert.ok(options.body.cosmetics.some((i:any)=>i.id==='pack-skin:'+legacy));
 const hero=options.body.cosmetics.find((i:any)=>i.type==='CHAMPION_SKIN'&&i.targetId==='cosmetic-hero');assert.ok(hero);
 const before=await database.select().from(schema.userCosmeticsTable),legacyBefore=await database.select().from(schema.userCardSkinCollectionsTable);
 const payload={name:'기존팩 선수 스킨 AI',championDefinitionId:'cosmetic-hero',cardDefinitionIds:deck,enabled:true,difficulty:'NORMAL',cosmeticIds:[hero.id,'pack-skin:'+legacy]};
 const saved=await api('/admin/ai-decks','admin','POST',payload);assert.equal(saved.status,201,JSON.stringify(saved.body));const id=saved.body.deck.id;
 const actual=(await api('/ai-decks','player-b')).body.decks.find((d:any)=>d.id===id);assert.equal(cosmeticImage(actual.cosmetics,'CARD_SKIN',cards[0].id,'art','base'),uploaded);assert.equal(actual.cosmetics.skins['champion:cosmetic-hero'].id,hero.id);
 assert.deepEqual(await database.select().from(schema.userCosmeticsTable),before);assert.deepEqual(await database.select().from(schema.userCardSkinCollectionsTable),legacyBefore);
 assert.equal((await api(`/admin/ai-decks/${id}/duplicate`,'admin','POST')).status,201);
});
