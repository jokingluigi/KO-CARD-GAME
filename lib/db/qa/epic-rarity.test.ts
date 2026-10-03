import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { eq } from 'drizzle-orm';
import * as schema from '../src/schema';
import { maxCardCopies, validateDeckCounts } from '../../game-engine/src/rules';
import { normalizeCardRarity, normalizeCardRarityForType, allowedCardRarities } from '../../../artifacts/ko-game/src/game/cards/types';
import { cardRecordToDefinition } from '../../../artifacts/ko-game/src/game/cards/published-cards';
import { createAdminTestDeckState, startAdminTestDeckGame } from '../../../artifacts/ko-game/src/lib/admin-test-deck';
import { createInitialGameState } from '../../../artifacts/ko-game/src/game/engine/create-initial-game-state';
import { startGame } from '../../../artifacts/ko-game/src/game/engine/turn-system';
import { TEST_CHAMPIONS } from '../../../artifacts/ko-game/src/game/champions/test-champions';
import { getDeckCardAction } from '../../../artifacts/ko-game/src/pages/deck-card-availability';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
const pg = new PGlite();
const database = drizzle(pg, { schema });
let decks: typeof import('../../../artifacts/api-server/src/routes/decks');
let ai: typeof import('../../../artifacts/api-server/src/lib/ai-deck-service');
let collection: typeof import('../../../artifacts/api-server/src/routes/collection');
let details: typeof import('../../../artifacts/api-server/src/lib/pack-details');
let admin: typeof import('../../../artifacts/api-server/src/routes/admin');
const cards = [
 ...Array.from({length: 10},(_,i)=>({id:`n${i}`,rarity:'NORMAL'})),
 ...Array.from({length: 12},(_,i)=>({id:`e${i}`,rarity:'EPIC'})),
 ...Array.from({length: 4},(_,i)=>({id:`l${i}`,rarity:'LEGENDARY'})),
].map(c=>({...c,name:c.id,cardType:'WRESTLER',cost:1,attack:2,health:3,text:'',status:'PUBLISHED'}));
const pad=(ids:string[])=>[...ids,...Array.from({length:25-ids.length},(_,i)=>`n${Math.floor(i/3)}`)];
const asDB=()=>database as unknown as Parameters<typeof decks.resolveDeck>[3];
before(async()=>{
 for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await pg.exec(ddl);
 await database.insert(schema.usersTable).values({id:'qa',email:'epic@example.invalid',nickname:'epic',passwordHash:'unusable',role:'ADMIN'});
 await database.insert(schema.championsTable).values({id:'hero',name:'Hero',abilityName:'None',abilityEffects:{},status:'PUBLISHED'});
 await database.insert(schema.cardsTable).values(cards);
 decks=await import('../../../artifacts/api-server/src/routes/decks');
 ai=await import('../../../artifacts/api-server/src/lib/ai-deck-service');
 collection=await import('../../../artifacts/api-server/src/routes/collection');
 details=await import('../../../artifacts/api-server/src/lib/pack-details');
 admin=await import('../../../artifacts/api-server/src/routes/admin');
});
after(async()=>{await pg.close();const {pool}=await import('../src/index');await pool.end();});
async function validate(ids:string[]){
 const payload={name:'QA',championDefinitionId:'hero',cardDefinitionIds:ids};
 const error=await decks.validateReferences(payload,'qa',false,asDB());
 const now=new Date();
 const resolved=await decks.resolveDeck({id:'virtual',userId:'qa',...payload,isSelected:false,deletedAt:null,createdAt:now,updatedAt:now},'qa',false,asDB());
 return {error,resolved};
}
for(const [rarity,id,limit] of [['NORMAL','n9',3],['EPIC','e0',2],['LEGENDARY','l0',1]] as const){
 for(let count=1;count<=limit+1;count++)test(`${rarity} copies ${count}: authoritative save and load`,async()=>{
  const {error,resolved}=await validate(pad(Array(count).fill(id)));
  assert.equal(error===null,count<=limit);assert.equal(resolved.isValid,count<=limit);
  assert.equal(maxCardCopies(rarity),limit);
 });
}
for(let count=1;count<=4;count++)test(`total LEGENDARY ${count}`,async()=>{
 const {error,resolved}=await validate(pad(Array.from({length:count},(_,i)=>`l${i}`)));
 assert.equal(error===null,count<=3);assert.equal(resolved.isValid,count<=3);
});
test('mixed 25-card deck persists unchanged, EPIC has no aggregate limit',async()=>{
 const ids=pad(['n9','n9','n9','e0','e0','e1','e1','l0','l1','l2']);
 assert.equal((await validate(ids)).resolved.isValid,true);
 await database.insert(schema.decksTable).values({id:'mixed',userId:'qa',name:'Mixed',championDefinitionId:'hero',cardDefinitionIds:ids});
 const [saved]=await database.select().from(schema.decksTable).where(eq(schema.decksTable.id,'mixed'));
 assert.deepEqual(saved.cardDefinitionIds,ids);assert.equal((await decks.resolveDeck(saved,'qa',false,asDB())).isValid,true);
 const epicHeavy=[...Array.from({length:12},(_,i)=>[`e${i}`,`e${i}`]).flat(),'n0'];
 assert.equal((await validate(epicHeavy)).resolved.isValid,true);
});
test('old NORMAL and three-legendary decks remain valid; four-legendary rows preserved with actionable errors',async()=>{
 for(const ids of [pad([]),pad(['l0','l1','l2'])])assert.equal((await validate(ids)).resolved.isValid,true);
 const ids=pad(['l0','l1','l2','l3']);
 await database.insert(schema.decksTable).values({id:'old',userId:'qa',name:'Old',championDefinitionId:'hero',cardDefinitionIds:ids});
 const [saved]=await database.select().from(schema.decksTable).where(eq(schema.decksTable.id,'old'));
 const result=await decks.resolveDeck(saved,'qa',false,asDB());
 assert.deepEqual(result.cardDefinitionIds,ids);assert.equal(result.isValid,false);assert.match(result.invalidReasons.join(' '),/3장/);
});
test('EPIC Admin parser, DB edit, serialization and definition preserve grade and old rows',async()=>{
 const input={name:'Epic created',cardType:'WRESTLER',rarity:'EPIC',cost:2,attack:4,health:5,text:'',isToken:false,isChampionToken:false,keywords:[],tags:[],effectConfig:{}};
 const parsed=admin.parseCardInput(input);assert.ok(parsed);assert.equal(parsed.rarity,'EPIC');
 await database.insert(schema.cardsTable).values({id:'created',...parsed});
 await database.update(schema.cardsTable).set({name:'Epic edited'}).where(eq(schema.cardsTable.id,'created'));
 const [record]=await database.select().from(schema.cardsTable).where(eq(schema.cardsTable.id,'created'));
 assert.equal(JSON.parse(JSON.stringify(record)).rarity,'EPIC');assert.equal(record.name,'Epic edited');
 assert.equal(cardRecordToDefinition(record as never).rarity,'EPIC');
 assert.equal(admin.parseCardInput({...input,cardType:'TECHNIQUE'})?.rarity,'EPIC');
 assert.equal(admin.parseCardInput({...input,rarity:'UNKNOWN'}),null);
 for(const rarity of ['NORMAL','EPIC','LEGENDARY'] as const)assert.equal(normalizeCardRarity(rarity),rarity);
 assert.equal(normalizeCardRarityForType('TECHNIQUE','EPIC'),'EPIC');assert.ok(allowedCardRarities('TECHNIQUE').includes('EPIC'));
 assert.equal((await database.select().from(schema.cardsTable).where(eq(schema.cardsTable.id,'l0')))[0].rarity,'LEGENDARY');
});
test('EPIC packs are opt-in, details and idempotent claims support EPIC',async()=>{
 const [pack]=await database.insert(schema.packDefinitionsTable).values({id:'epic-pack',name:'Epic',normalRate:0,epicRate:100,legendaryRate:0,championRate:0,epicCardPool:['e0'],cardsPerPack:3}).returning();
 const rewards=await collection.rollPack(pack,asDB());assert.equal(rewards.length,3);assert.ok(rewards.every(r=>r.rewardType==='EPIC_CARD'&&'card' in r&&r.card.rarity==='EPIC'));
 const view=await details.getPackDetails(pack,database as never);assert.equal(view.valid,true);assert.equal(view.epicCards[0].individualProbability,100);
 const {encodeBulkClaim,decodeClaimForRequest}=await import('../../../artifacts/api-server/src/lib/pack-opening-service');
 const openings=[{rewards:rewards as unknown as Record<string,unknown>[]}];assert.equal(decodeClaimForRequest(encodeBulkClaim(openings,1),'bulk',1).kind,'bulk');
 const [normal]=await database.insert(schema.packDefinitionsTable).values({id:'normal-pack',name:'Normal',normalRate:100,legendaryRate:0,championRate:0,normalCardPool:['n0']}).returning();
 assert.equal(normal.epicRate,0);assert.ok((await collection.rollPack(normal,asDB())).every(r=>r.rewardType==='NORMAL_CARD'));
 await assert.rejects(collection.rollPack({...pack,epicCardPool:[]},asDB()),/EPIC/);
});
test('additive pack migration retains prior rates and rows on repeated execution',async()=>{
 const isolated=new PGlite();try{
  await isolated.exec("CREATE TABLE pack_definitions (id text PRIMARY KEY, normal_rate integer, legendary_rate integer, champion_rate integer); INSERT INTO pack_definitions VALUES ('old',90,7,3)");
  const sql=await readFile(new URL('../migrations/0036_epic_pack_configuration.sql',import.meta.url),'utf8');await isolated.exec(sql);await isolated.exec(sql);
  assert.deepEqual((await isolated.query('SELECT * FROM pack_definitions')).rows,[{id:'old',normal_rate:90,legendary_rate:7,champion_rate:3,epic_rate:0,epic_card_pool:[]}]);
 }finally{await isolated.close();}
});
test('AI exceptions, test deck and actual engine match start retain EPIC',async()=>{
 const result=await ai.validateAIDeckReferences('hero',Array(7).fill('e0'),'AI_DECK',asDB());assert.equal(result.isValid,true);
 assert.equal((await ai.validateAIDeckReferences('hero',pad(Array(3).fill('e0')),'PLAYER_DECK',asDB())).isValid,false);
 const defs=(await database.select().from(schema.cardsTable)).map(c=>cardRecordToDefinition(c as never));
 const champions=TEST_CHAMPIONS;const champIds=[champions[0].id,champions[1].id] as [string,string];
 const ids=pad(['e0','e0','l0','l1','l2']);
 const state=startGame(createInitialGameState(champIds,defs,champions,[ids,ids]),()=>0.5);
 assert.equal(state.players[0].hand.length,4);assert.ok(state.cardPool?.some(c=>c.rarity==='EPIC'));
 const flexible=createAdminTestDeckState(defs,champions,champIds,[Array(7).fill('e0'),['e1']]);assert.equal(flexible.players[0].deck.length,7);
 assert.equal(startAdminTestDeckGame(defs,champions,champIds,[Array(7).fill('e0'),['e1']]).players[0].hand.length,4);
 const args={count:1,deckCount:1,deckSize:25,legendaryCount:0,maxLegendaryCards:3,isTestAccount:true};
 const epic={...cards[10],imageUrl:null,imageDisplayMode:'COVER',imageScale:1,imagePositionX:50,imagePositionY:50,isToken:false,isChampionToken:false} as never;
 assert.equal(getDeckCardAction(epic,args).kind,'ADD');assert.equal(getDeckCardAction(epic,{...args,count:2}).kind,'DISABLED');
 assert.deepEqual(validateDeckCounts({cardCount:24,legendaryCount:0,championCount:1}),['INVALID_CARD_COUNT']);
});

test('technique grades normalize to EPIC/TOKEN in admin, runtime and idempotent migration', async()=>{
 assert.deepEqual(allowedCardRarities('TECHNIQUE'),['EPIC','TOKEN']);
 const base={name:'Technique grade QA',cardType:'TECHNIQUE',cost:1,attack:0,health:0,text:'unchanged',isToken:false,isChampionToken:false,keywords:[],tags:[],effectConfig:{},status:'DRAFT'};
 for(const rarity of ['NORMAL','EPIC','LEGENDARY','CHAMPION','TOKEN'] as const){
  const expected=rarity==='TOKEN'?'TOKEN':'EPIC';
  assert.equal(admin.parseCardInput({...base,rarity})?.rarity,expected);
  assert.equal(normalizeCardRarityForType('TECHNIQUE',rarity),expected);
  assert.equal(cardRecordToDefinition({...base,id:'qa',rarity} as never).rarity,expected);
  await database.insert(schema.cardsTable).values({...base,id:`tech-grade-${rarity}`,rarity});
 }
 assert.equal(admin.parseCardInput({...base,rarity:'NORMAL',isToken:true})?.rarity,'TOKEN');
 await database.insert(schema.cardsTable).values({...base,id:'tech-grade-flagged-token',isToken:true,rarity:'NORMAL'});
 const decksBefore=await database.select().from(schema.decksTable);
 const wrestlersBefore=(await database.select().from(schema.cardsTable)).filter(c=>c.cardType==='WRESTLER');
 const packsBefore=await database.select().from(schema.packDefinitionsTable);
 const migration=await readFile(new URL('../migrations/0038_technique_rarities.sql',import.meta.url),'utf8');
 await pg.exec(migration);
 const techniques=(await database.select().from(schema.cardsTable)).filter(c=>c.cardType==='TECHNIQUE');
 assert.equal(techniques.length,6);
 for(const c of techniques){
  assert.equal(c.rarity,c.id.endsWith('TOKEN')||c.isToken?'TOKEN':'EPIC');
  assert.equal(c.status,'DRAFT');assert.equal(c.text,'unchanged');
 }
 await pg.exec(migration);
 assert.deepEqual((await database.select().from(schema.cardsTable)).filter(c=>c.cardType==='TECHNIQUE'),techniques);
 assert.deepEqual((await database.select().from(schema.cardsTable)).filter(c=>c.cardType==='WRESTLER'),wrestlersBefore);
 assert.deepEqual(await database.select().from(schema.decksTable),decksBefore);
 assert.deepEqual(await database.select().from(schema.packDefinitionsTable),packsBefore);
});
