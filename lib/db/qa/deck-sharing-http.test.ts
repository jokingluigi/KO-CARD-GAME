import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';
import {eq} from 'drizzle-orm';
import * as schema from '../src/schema';
process.env.DATABASE_URL='postgresql://unused:unused@127.0.0.1:1/unused';process.env.NODE_ENV='development';
const pg=new PGlite(),database=drizzle(pg,{schema});
for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await pg.exec(ddl);
await pg.exec(await readFile(new URL('../migrations/0033_server_maintenance.sql',import.meta.url),'utf8'));
const {db,pool}=await import('../src/index');
for(const method of ['select','insert','update','delete','transaction','execute'] as const)Object.assign(db,{[method]:database[method].bind(database)});
const {hashPassword}=await import('../../../artifacts/api-server/src/lib/auth');
const password='LocalMusic12345';
await database.insert(schema.usersTable).values([
 {id:'music-admin',email:'admin@music.invalid',nickname:'Music Admin',role:'ADMIN',passwordHash:await hashPassword(password)},
 {id:'music-user',email:'user@music.invalid',nickname:'Music User',role:'USER',passwordHash:await hashPassword(password)},
]);
const rows=[['win1','VICTORY_BGM',true],['win2','VICTORY_BGM',false],['loss1','DEFEAT_BGM',true],['loss2','DEFEAT_BGM',false],['match','BGM',true]] as const;
await database.insert(schema.gameMediaTable).values(rows.map(([id,mediaType,gameEnabled])=>({id,mediaType,name:id,assetId:'/objects/uploads/game-bgm/'+id+'.mp3',assetUrl:'/api/storage/objects/uploads/game-bgm/'+id+'.mp3',fileName:id+'.mp3',contentType:'audio/mpeg',volume:75,gameEnabled,enabled:gameEnabled})));
const {default:app}=await import('../../../artifacts/api-server/src/app');
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.on('listening',r));const addr=server.address();assert.ok(addr&&typeof addr==='object');const base='http://127.0.0.1:'+addr.port+'/api';
after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await pool.end();await pg.close();});
function client(){let cookie='';return async(path:string,method='GET',body?:unknown)=>{
 const r=await fetch(base+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie')!.split(';')[0]!;
 return{status:r.status,body:await r.json()};
};}
const admin=client(),user=client(),guest=client();

const {encodeDeck,decodeDeck}=await import('../../../artifacts/ko-game/src/lib/deck-share-code');
const {createDeckSnapshot}=await import('../../../artifacts/ko-game/src/lib/deck-share-validation');
await database.insert(schema.championsTable).values({id:'share-champion',name:'공유 챔피언',abilityName:'회복',abilityEffects:{effects:[]},status:'PUBLISHED'});
await database.insert(schema.cardsTable).values(Array.from({length:9},(_,i)=>({id:'share-card-'+i,name:'공유 선수 '+i,cardType:'WRESTLER',cost:1,attack:2,health:3,text:'효과 없음',rarity:'NORMAL',status:'PUBLISHED'})));
await database.insert(schema.userChampionCollectionsTable).values({userId:'music-user',championDefinitionId:'share-champion',owned:true});
await database.insert(schema.userCardCollectionsTable).values(Array.from({length:9},(_,i)=>({userId:'music-user',cardDefinitionId:'share-card-'+i,quantity:3})));
let sourceId='',importId='',code='';
const allIds=Array.from({length:9},(_,i)=>Array(i<8?3:1).fill('share-card-'+i)).flat();
test('independent code creates a fresh owned deck through the actual authenticated POST and official validation',async()=>{
 assert.equal((await user('/auth/login','POST',{email:'user@music.invalid',password})).status,200);
 const options=(await user('/decks/options')).body;
 const snap=createDeckSnapshot('공유 덱',options.champions.find((c:any)=>c.id==='share-champion'),allIds,new Map(options.cards.map((c:any)=>[c.id,c])));
 const before=await database.select().from(schema.decksTable);
 code=encodeDeck(snap);const restored=decodeDeck(code);assert.equal((await database.select().from(schema.decksTable)).length,before.length);
 const body={name:restored.name,championDefinitionId:restored.championId,cardDefinitionIds:restored.cards.flatMap(c=>Array(c.count).fill(c.id))};
 const a=await user('/decks','POST',body),b=await user('/decks','POST',body);assert.equal(a.status,201);assert.equal(b.status,201);sourceId=a.body.deck.id;importId=b.body.deck.id;assert.notEqual(sourceId,importId);assert.equal(b.body.deck.isValid,true);
 assert.deepEqual([...b.body.deck.cardDefinitionIds].sort(),[...allIds].sort());
 assert.equal((await user('/decks/'+importId+'/select','POST')).status,200);
 assert.equal((await user('/decks/'+sourceId,'PATCH',{...body,name:'변경된 원본'})).status,200);assert.equal(decodeDeck(code).name,'공유 덱');
 assert.equal((await user('/decks')).body.decks.find((d:any)=>d.id===importId).name,'공유 덱');
});
test('persisted imported composition starts and plays through the same engine used by AI battles',async()=>{
 const engine=await import('../../../artifacts/ko-game/src/game/index');
 const deck=(await user('/decks')).body.decks.find((d:any)=>d.id===importId);
 const definitions=deck.cards.map(engine.cardRecordToDefinition);
 const champion=engine.championRecordToDefinition(deck.champion);
 let state=engine.startGame(engine.createInitialGameState([champion.id,champion.id],definitions,[champion],[deck.cardDefinitionIds,deck.cardDefinitionIds],{randomSeed:12345}));
 const exchanged=engine.executeAction(state,{type:'MULLIGAN',playerId:state.activePlayerId!,cardInstanceIds:[]});assert.equal(exchanged.success,true,exchanged.message);state=exchanged.state;
 let played=false;
 for(let i=0;i<8&&!played;i++){
  const actions=engine.getLegalActions(state,state.activePlayerId!);
  const action=actions.find(a=>a.type==='PLAY_WRESTLER')??actions.find(a=>a.type==='END_TURN');assert.ok(action);
  const result=engine.executeAction(state,action);assert.equal(result.success,true);state=result.state;played=action.type==='PLAY_WRESTLER';
 }
 assert.equal(played,true);assert.ok(state.events.some(e=>e.type==='CARD_PLAYED'));
 const result=engine.executeAction(state,{type:'SURRENDER',playerId:state.activePlayerId!});assert.equal(result.success,true);assert.equal(result.state.status,'FINISHED');
});
test('actual server rejects forged ownership, tokens, duplicate/rarity breaches and cross-account mutation',async()=>{
 await database.insert(schema.usersTable).values({id:'share-stranger',email:'stranger@share.invalid',nickname:'stranger',role:'USER',passwordHash:await hashPassword(password)});
 const stranger=client();assert.equal((await stranger('/auth/login','POST',{email:'stranger@share.invalid',password})).status,200);
 const deck=decodeDeck(code),body={name:deck.name,championDefinitionId:deck.championId,cardDefinitionIds:allIds};
 assert.equal((await stranger('/decks','POST',body)).status,400);
 assert.equal((await stranger('/decks/'+sourceId,'PATCH',body)).status,404);assert.equal((await stranger('/decks/'+sourceId,'DELETE')).status,404);
 assert.equal((await guest('/decks','POST',body)).status,401);
 const copies={...body,cardDefinitionIds:Array(25).fill('share-card-0')};assert.equal((await user('/decks','POST',copies)).status,400);
 await database.update(schema.cardsTable).set({isToken:true}).where(eq(schema.cardsTable.id,'share-card-0'));assert.equal((await user('/decks','POST',body)).status,400);
 await database.update(schema.cardsTable).set({isToken:false,rarity:'LEGENDARY'}).where(eq(schema.cardsTable.id,'share-card-0'));assert.equal((await user('/decks','POST',body)).status,400);
 await database.update(schema.cardsTable).set({rarity:'NORMAL'}).where(eq(schema.cardsTable.id,'share-card-0'));
 await database.update(schema.userCardCollectionsTable).set({quantity:1}).where(eq(schema.userCardCollectionsTable.cardDefinitionId,'share-card-0'));assert.equal((await user('/decks','POST',body)).status,400);
 const decks=(await user('/decks')).body.decks;assert.equal(decks.find((d:any)=>d.id===importId).isValid,false);assert.equal((await user('/decks/'+importId+'/select','POST')).status,400);
 assert.equal((await database.select().from(schema.userCardCollectionsTable)).find(c=>c.cardDefinitionId==='share-card-0')!.quantity,1);
});
