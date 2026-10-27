import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {database,pg,api,cards,deck} from './cosmetics.test';
import * as schema from '../src/schema';
import {eq,sql} from 'drizzle-orm';
import {aiSkinLoadout,aiSkinSelectionError} from '../../../artifacts/api-server/src/lib/ai-deck-cosmetics';
const item=(id:string,type='CHAMPION_SKIN',targetId='cosmetic-hero')=>({id,type,targetId,name:id,description:'',imageAssets:{art:'https://example.invalid/'+id+'.png'},isActive:true,sortOrder:0});
test('AI skins persist through real authorized deck APIs, duplicate and quick-AI freeze; never grant inventory',async()=>{
 const migration=await readFile(new URL('../migrations/0055_ai_deck_cosmetics.sql',import.meta.url),'utf8');await pg.exec(migration);await pg.exec(migration);
 const champ=item('ai-hero-skin'),card=item('ai-card-skin','CARD_SKIN',cards[0]!.id),wrong=item('ai-wrong','CARD_SKIN',cards[1]!.id),other=item('ai-hero-other');
 await database.insert(schema.cosmeticItemsTable).values([champ,card,wrong,other]);
 const ownedBefore=await database.select().from(schema.userCosmeticsTable);
 const payload={name:'AI skin regression',description:'Preserve this description',championDefinitionId:'cosmetic-hero',cardDefinitionIds:deck,difficulty:'NORMAL',enabled:true,displayOrder:5,cosmeticIds:[champ.id,card.id]};
 assert.equal((await api('/admin/ai-decks','player-a','POST',payload)).status,403);
 const created=await api('/admin/ai-decks','admin','POST',payload);assert.equal(created.status,201,JSON.stringify(created.body));const id=created.body.deck.id;
 assert.deepEqual(new Set(created.body.deck.cosmeticIds),new Set(payload.cosmeticIds));assert.equal(created.body.deck.cosmetics.skins['champion:cosmetic-hero'].id,champ.id);
 const options=await api('/admin/ai-decks/options');assert.equal(options.body.aiCosmeticsAvailable,true);assert.ok(options.body.cosmetics.some((i:any)=>i.id===champ.id));
 for(const cosmeticIds of [['missing'],[champ.id,champ.id],[champ.id,other.id]])assert.equal((await api('/admin/ai-decks/'+id,'admin','PATCH',{...payload,cosmeticIds})).status,422);
 assert.equal((await api('/admin/ai-decks/'+id,'admin','PATCH',{...payload,cardDefinitionIds:[cards[0]!.id],cosmeticIds:[wrong.id]})).status,422);
 const {cosmeticIds:_,...legacy}=payload;assert.equal((await api('/admin/ai-decks/'+id,'admin','PATCH',legacy)).status,200);
 const listed=(await api('/ai-decks','player-a')).body.decks.find((d:any)=>d.id===id);assert.equal(listed.description,payload.description);assert.equal(listed.cosmetics.skins['card:'+cards[0]!.id].id,card.id);
 const duplicate=await api('/admin/ai-decks/'+id+'/duplicate','admin','POST');assert.equal(duplicate.status,201);assert.deepEqual(new Set(duplicate.body.deck.cosmeticIds),new Set(payload.cosmeticIds));
 await database.update(schema.aiDecksTable).set({enabled:false}).where(eq(schema.aiDecksTable.id,'cosmetic-ai'));
 const {prepareQuickAI,readQuickAI,releaseQuickAI}=await import('../../../artifacts/api-server/src/lib/quick-ai-match');
 const matchId=await prepareQuickAI('player-a','deck-player-a');const frozen=await readQuickAI('player-a',matchId);assert.equal(frozen!.aiDeckId,id);assert.equal((frozen!.opponentCosmetics as any).skins['champion:cosmetic-hero'].id,champ.id);
 await api('/admin/ai-decks/'+id,'admin','PATCH',{...payload,cosmeticIds:[]});assert.equal(((await readQuickAI('player-a',matchId))!.opponentCosmetics as any).skins['champion:cosmetic-hero'].id,champ.id);assert.equal(await readQuickAI('player-b',matchId),null);await releaseQuickAI('player-a',matchId);
 assert.deepEqual(await database.select().from(schema.userCosmeticsTable),ownedBefore);
 await database.update(schema.cosmeticItemsTable).set({isActive:false}).where(eq(schema.cosmeticItemsTable.id,champ.id));
 const disabled=(await api('/admin/ai-decks')).body.decks.find((d:any)=>d.id===duplicate.body.deck.id);assert.equal(disabled.cosmetics.skins['champion:cosmetic-hero'],undefined);
 assert.equal((await api('/admin/ai-decks/'+id,'admin','DELETE')).status,204);assert.equal((await database.select().from(schema.aiDeckCosmeticsTable).where(eq(schema.aiDeckCosmeticsTable.deckId,id))).length,0);
 await api('/admin/ai-decks/'+duplicate.body.deck.id,'admin','DELETE');await database.update(schema.aiDecksTable).set({enabled:true}).where(eq(schema.aiDecksTable.id,'cosmetic-ai'));
 // Missing migration never breaks existing AI reads and rejects writes before changing a deck.
 await pg.exec('ALTER TABLE ai_deck_cosmetics RENAME TO ai_deck_cosmetics_held');
 try {assert.equal((await api('/ai-decks','player-a')).status,200);assert.equal((await api('/admin/ai-decks/options')).body.aiCosmeticsAvailable,false);assert.equal((await api('/admin/ai-decks','admin','POST',payload)).status,503);}finally{await pg.exec('ALTER TABLE ai_deck_cosmetics_held RENAME TO ai_deck_cosmetics');}
});
