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
after(async () => { const {getRuntime,cleanupMatchRuntime}=await import('../../../artifacts/api-server/src/online/service');const runtime=await getRuntime('feature-reward-pvp');if(runtime){await runtime.queue;runtime.state={...runtime.state,status:'FINISHED'};cleanupMatchRuntime('feature-reward-pvp');}await new Promise<void>(resolve=>server.close(()=>resolve()));await pg.close();await pool.end(); });
const championInput={name:'Feature Champion',maxHealth:20,abilityName:'Ability',abilityCost:0,abilityText:'',abilityEffects:{},hasQuest:false,gameStartAbilityName:'사전 준비',gameStartAbilityText:'상대 챔피언에게 2 피해',gameStartAbilityEffects:{effects:[{trigger:'GAME_START',action:'DAMAGE',target:{zone:'CHARACTER',owner:'ENEMY',selection:'ALL',count:1},values:{amount:2}}]}};
test('administrator saves separate game-start ability, roundtrips it, and preserves manual targets without blocking battle start',async()=>{
 assert.equal((await request('/auth/login','POST',{email:'admin@feature.invalid',password:'AwakeningLocalQA123'})).status,200);
 const created=await request('/admin/champions','POST',championInput);assert.equal(created.status,201,JSON.stringify(created.body));record=created.body.champion;id=record.id;
 assert.equal(record.gameStartAbilityName,championInput.gameStartAbilityName);assert.equal(championRecordToDefinition(record).gameStartAbility?.effects.length,1);
 const invalid=await request('/admin/champions/'+id,'PATCH',{...championInput,version:record.version,gameStartAbilityEffects:{effects:[{trigger:'GAME_START',action:'DAMAGE',target:{zone:'CHARACTER',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:1}}]}});assert.equal(invalid.status,200,JSON.stringify(invalid.body));record=invalid.body.champion;assert.equal(championRecordToDefinition(record).gameStartAbility?.effects.length,0);
 const saved=await request('/admin/champions/'+id,'PATCH',{...championInput,version:record.version,gameStartAbilityName:'개정 시작 능력'});assert.equal(saved.status,200,JSON.stringify(saved.body));record=saved.body.champion;
 const fetched=await request('/admin/champions');assert.equal(fetched.body.champions.find((c:any)=>c.id===id).gameStartAbilityName,'개정 시작 능력');assert.deepEqual(record.abilityEffects,{});
});
test('administrator saves independent retire/destroy dialogue and rejects invalid text',async()=>{
 const cardInput={name:'Exit Speaker',cardType:'WRESTLER',rarity:'NORMAL',cost:2,attack:2,health:3,text:'',keywords:[],tags:[],isToken:false,isChampionToken:false,effectId:null,effectConfig:{},summonLine:'등장!',retireLine:'다음에 보자',destroyLine:'이럴 수가'};
 const created=await request('/admin/cards','POST',cardInput);assert.equal(created.status,201,JSON.stringify(created.body));const c=created.body.card;
 assert.equal(cardRecordToDefinition(c).retireLine,cardInput.retireLine);assert.equal(c.destroyLine,cardInput.destroyLine);
 const updated=await request('/admin/cards/'+c.id,'PATCH',{...cardInput,retireLine:'수정된 퇴장',version:c.version});assert.equal(updated.status,200,JSON.stringify(updated.body));assert.equal(updated.body.card.retireLine,'수정된 퇴장');assert.equal(updated.body.card.destroyLine,cardInput.destroyLine);
 for(const line of ['a'.repeat(141),'<script>bad</script>'])assert.equal((await request('/admin/cards/'+c.id,'PATCH',{...cardInput,destroyLine:line,version:updated.body.card.version})).status,400);
});
test('authoritative PvP allows reward selection on opposing turn, concurrent retry, and reconnect exactly once',async()=>{
 const {directDeployChampionToken}=await import('../../../artifacts/ko-game/src/game/engine/champion-token');
 const {TEST_CHAMPION_TOKEN_DEFINITION:token}=await import('../../../artifacts/ko-game/src/game/cards/test-cards');
 const {applyMatchAction,getRuntime,cleanupMatchRuntime}=await import('../../../artifacts/api-server/src/online/service');
 await database.insert(schema.usersTable).values({id:'feature-opponent',email:'opponent@feature.invalid',nickname:'Opponent',passwordHash:'unused',role:'USER'});
 await database.insert(schema.decksTable).values([{id:'feature-deck1',userId:'feature-admin',name:'QA'},{id:'feature-deck2',userId:'feature-opponent',name:'QA'}]);
 const champion=championRecordToDefinition(record);const basic={id:'basic',name:'basic',cardType:'WRESTLER' as const,cost:1,attack:2,health:3,rulesText:'',keywords:[],abilities:[],isToken:false,isChampionToken:false};
 let state=createInitialGameState([champion.id,champion.id],[basic,token],[champion]);state.players[0].id='PLAYER_ONE';state.players[1].id='PLAYER_TWO';state.status='IN_PROGRESS';state.turn=2;state.activePlayerId='PLAYER_TWO';
 for(const i of [0,1,2,3] as const) state.players[0].board[i]={...generateCardInstance(basic,{instanceId:'field-'+i}),boardSlot:i};
 state=directDeployChampionToken(state,'PLAYER_ONE',champion.id,token.id,'CHAMPION_QUEST_REWARD');
 await database.insert(schema.onlineMatchesTable).values({id:'feature-reward-pvp',status:'ACTIVE',player1UserId:'feature-admin',player2UserId:'feature-opponent',player1DeckId:'feature-deck1',player2DeckId:'feature-deck2',stateVersion:0,serializedGameState:state,serializedSnapshot:{player1UserId:'feature-admin',player2UserId:'feature-opponent',player1DeckId:'feature-deck1',player2DeckId:'feature-deck2',cardDefinitions:state.cardPool,championDefinitions:[champion],publicPlayers:[{seat:'PLAYER_ONE',nickname:'QA1'},{seat:'PLAYER_TWO',nickname:'QA2'}],introFirstSpeaker:null}});
 const runtime=await getRuntime('feature-reward-pvp');assert.ok(runtime);const a=sanitizeGameStateForViewer(runtime.state,'PLAYER_ONE') as any,b=sanitizeGameStateForViewer(runtime.state,'PLAYER_TWO') as any;assert.ok(a.targetingState?.championRewardReplacement);assert.ok(!b.targetingState);
 const payload={type:'SELECT_EFFECT_TARGET' as const,targetId:'field-2'};
 const rejected=await applyMatchAction('feature-reward-pvp','feature-opponent','wrong-owner',0,payload);assert.equal(rejected.ok,false);assert.equal(runtime.version,0);
 const results=await Promise.all([applyMatchAction('feature-reward-pvp','feature-admin','reward-select',0,payload),applyMatchAction('feature-reward-pvp','feature-admin','reward-select',0,payload)]);
 assert.ok(results.every(r=>r.ok),JSON.stringify(results.map(r=>({ok:r.ok,...(!r.ok?{code:r.code,message:r.message}:{})}))));assert.equal(runtime.state.players[0].board.filter(c=>c?.isChampionToken).length,1);assert.equal(runtime.state.players[0].hand.filter(c=>c.instanceId==='field-2').length,1);assert.equal(runtime.state.activePlayerId,'PLAYER_TWO');assert.ok(!runtime.state.targetingState);
 const version=runtime.version;const persisted=JSON.stringify(runtime.state);cleanupMatchRuntime('feature-reward-pvp');const restored=await getRuntime('feature-reward-pvp');assert.ok(restored);assert.equal(restored.version,version);assert.deepEqual(restored.state,JSON.parse(persisted));
});

test('additive migration preserves old rows and remains safe on repeated startup',async()=>{const legacy=new PGlite();try{await legacy.exec("CREATE TABLE cards(id text PRIMARY KEY,name text,cost int,attack int,health int); CREATE TABLE champions(id text PRIMARY KEY,name text,ability_effects jsonb); INSERT INTO cards VALUES ('old','unchanged',3,4,5); INSERT INTO champions VALUES ('old','unchanged','{}');");const migration=await readFile(new URL('../migrations/0048_champion_start_and_exit_lines.sql',import.meta.url),'utf8');await legacy.exec(migration);await legacy.exec("UPDATE cards SET retire_line='keep retire', destroy_line='keep destroy'; UPDATE champions SET game_start_ability_name='keep start',game_start_ability_effects='{}';");await legacy.exec(migration);assert.deepEqual((await legacy.query('SELECT cost,attack,health,retire_line,destroy_line FROM cards')).rows,[{cost:3,attack:4,health:5,retire_line:'keep retire',destroy_line:'keep destroy'}]);assert.equal((await legacy.query<any>('SELECT game_start_ability_name FROM champions')).rows[0].game_start_ability_name,'keep start');}finally{await legacy.close();}});

test('card saves preserve uncertified effects without analysis or approval',async()=>{
 const input={name:'Manual effect save',cardType:'WRESTLER',rarity:'NORMAL',cost:2,attack:2,health:3,text:'관리자가 직접 작성한 효과',keywords:[],tags:[],isToken:false,isChampionToken:false,effectId:'STRUCTURED_EFFECTS_V1',effectConfig:{effects:[{trigger:'ACTIVE',action:'DAMAGE',target:{zone:'CHARACTER',owner:'ENEMY',selection:'PLAYER_CHOICE',count:1},values:{amount:2}}]}};
 const created=await request('/admin/cards','POST',input);assert.equal(created.status,201,JSON.stringify(created.body));assert.deepEqual(created.body.card.effectConfig,input.effectConfig);
 const config={scripts:[{trigger:'ON_ENTER',steps:[{type:'UNRECOGNIZED_MANUAL_STEP',note:'보존해야 하는 미완료 설정'}]}]};
 const saved=await request('/admin/cards/'+created.body.card.id,'PATCH',{...input,effectId:'SCRIPT_V1',effectConfig:config});assert.equal(saved.status,200,JSON.stringify(saved.body));assert.deepEqual(saved.body.card.effectConfig,config);assert.equal(saved.body.card.text,input.text);
 const fetched=await request('/admin/cards');assert.deepEqual(fetched.body.cards.find((c:any)=>c.id===created.body.card.id).effectConfig,config);
});
test('champion saves preserve uncertified ability, upgrade and reward configurations',async()=>{
 const config={effects:[{trigger:'ACTIVE',action:'MANUAL_UNRECOGNIZED_EFFECT',values:{note:'분석 없이 저장'}}]};
 const input={...championInput,name:'Manual champion save',abilityEffects:config,hasQuest:true,questName:'수동 퀘스트',questText:'카드 사용',questCondition:{event:'CARD_PLAYED',required:1},questProgressRequired:1,questRewardText:'관리자 보상',questRewardEffects:config,upgradedAbilityName:'강화',upgradedAbilityEffects:config};
 const created=await request('/admin/champions','POST',input);assert.equal(created.status,201,JSON.stringify(created.body));
 for(const key of ['abilityEffects','questRewardEffects','upgradedAbilityEffects'])assert.deepEqual(created.body.champion[key],config);
 const changed={effects:[{action:'ANOTHER_MANUAL_EFFECT'}]};
 const updated=await request('/admin/champions/'+created.body.champion.id,'PATCH',{...input,abilityEffects:changed,version:created.body.champion.version});assert.equal(updated.status,200,JSON.stringify(updated.body));assert.deepEqual(updated.body.champion.abilityEffects,changed);
 const fetched=await request('/admin/champions');assert.deepEqual(fetched.body.champions.find((c:any)=>c.id===created.body.champion.id).abilityEffects,changed);
});
test('saving incomplete champions preserves configuration and existing numbers without certification',async()=>{
 const created=await request('/admin/champions','POST',{name:'Incomplete',maxHealth:31,abilityCost:4,abilityName:'',abilityText:'text',hasQuest:true,questName:'',questText:'',questCondition:{event:'STATE_CONDITION',condition:{unfinished:true}},questProgressRequired:0,questRewardEffects:{effects:{unfinished:true}},championTokenDefinitionId:'not-created-yet',introLineOne:'x'.repeat(200)});
 assert.equal(created.status,201,JSON.stringify(created.body));let champion=created.body.champion;assert.equal(champion.maxHealth,31);assert.equal(champion.abilityCost,4);assert.equal(champion.questProgressRequired,0);assert.equal(champion.championTokenDefinitionId,'not-created-yet');assert.doesNotThrow(()=>championRecordToDefinition(champion));
 for(const config of [[], 'unfinished JSON', {scripts:[null],effects:[null,42]}]) {
  const saved=await request('/admin/champions/'+champion.id,'PATCH',{abilityEffects:config,questRewardEffects:config,maxHealth:'invalid',abilityCost:''});assert.equal(saved.status,200,JSON.stringify(saved.body));champion=saved.body.champion;assert.deepEqual(champion.abilityEffects,config);assert.equal(champion.maxHealth,31);assert.equal(champion.abilityCost,4);assert.equal(champion.name,'Incomplete');assert.doesNotThrow(()=>championRecordToDefinition(champion));
 }
 const stale=await request('/admin/champions/'+champion.id,'PATCH',{name:'stale',version:1});assert.equal(stale.status,409);const fetched=await request('/admin/champions');assert.equal(fetched.body.champions.find((c:any)=>c.id===champion.id).name,'Incomplete');
});

test('champion selection toggle affects only future draft picks and preserves card exclusions',async()=>{
 const created=await request('/admin/champions','POST',{...championInput,name:'Draft visibility'});
 assert.equal(created.status,201,JSON.stringify(created.body));const championId=created.body.champion.id;
 assert.equal((await request('/admin/champions/'+championId+'/status','POST',{status:'PUBLISHED'})).status,200);
 const cards=await request('/admin/cards');const cardId=cards.body.cards[0].id;
 assert.equal((await request('/admin/draft/cards/'+cardId+'/selection','PATCH',{excluded:true})).status,200);
 const savedCookie=cookie;cookie='';assert.equal((await request('/admin/draft/champion-selection')).status,401);cookie=savedCookie;
 const hide=await request('/admin/draft/champions/'+championId+'/selection','PATCH',{excluded:true});assert.equal(hide.status,200,JSON.stringify(hide.body));assert.ok(hide.body.excludedChampionIds.includes(championId));
 const {draftSettings,draftCatalog}=await import('../../../artifacts/api-server/src/lib/draft-service');
 const {selectableChampions}=await import('../../game-engine/src/draft/domain');
 const settings=await draftSettings(),snapshot=await draftCatalog(settings.config);
 assert.ok(settings.config.excludedCardIds.includes(cardId));assert.ok(!selectableChampions(snapshot).some(c=>c.id===championId));
 assert.ok(snapshot.champions.some(c=>c.id===championId));const record=(await request('/admin/champions')).body.champions.find((c:any)=>c.id===championId);assert.equal(record.status,'PUBLISHED');assert.deepEqual(record.abilityEffects,championInput.abilityEffects);
 assert.equal((await request('/admin/draft/champions/'+championId+'/selection','PATCH',{excluded:'yes'})).status,400);
 assert.equal((await request('/admin/draft/champions/missing/selection','PATCH',{excluded:true})).status,404);
 const show=await request('/admin/draft/champions/'+championId+'/selection','PATCH',{excluded:false});assert.equal(show.status,200);assert.ok(!show.body.excludedChampionIds.includes(championId));
 const restored=await draftCatalog((await draftSettings()).config);assert.ok(selectableChampions(restored).some(c=>c.id===championId));assert.ok(!selectableChampions(snapshot).some(c=>c.id===championId),'existing draft snapshots remain unchanged');
});

test('champion can become private independently of disabled state and be published again',async()=>{
 const created=await request('/admin/champions','POST',{...championInput,name:'Privacy toggle'});assert.equal(created.status,201);const id=created.body.champion.id;
 for(const status of ['PUBLISHED','DRAFT','PUBLISHED','DISABLED','DRAFT']){
  const result=await request('/admin/champions/'+id+'/status','POST',{status});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.champion.status,status);
  assert.equal(result.body.champion.name,'Privacy toggle');assert.deepEqual(result.body.champion.gameStartAbilityEffects,championInput.gameStartAbilityEffects);
 }
 const list=await request('/admin/champions');assert.equal(list.body.champions.find((c:any)=>c.id===id).status,'DRAFT');
 const {draftSettings,draftCatalog}=await import('../../../artifacts/api-server/src/lib/draft-service');const {selectableChampions}=await import('../../game-engine/src/draft/domain');assert.ok(!selectableChampions(await draftCatalog((await draftSettings()).config)).some(c=>c.id===id));
});

test('uncertified malformed effect containers are preserved without crashing champion loading',async()=>{
 for(const config of [{effects:{unfinished:true},scripts:{}},{effects:[null,42,{}, {action:'MANUAL_EFFECT'}],scripts:[null]}]){
  const result=await request('/admin/champions','POST',{...championInput,name:'Incomplete configuration',abilityEffects:config,upgradedAbilityName:'Upgrade',upgradedAbilityEffects:config,gameStartAbilityEffects:null});assert.equal(result.status,201,JSON.stringify(result.body));assert.deepEqual(result.body.champion.abilityEffects,config);assert.doesNotThrow(()=>championRecordToDefinition(result.body.champion));
 }
});

test('administrator saves fusion and cannot-attack keywords without effect certification',async()=>{
 const created=await request('/admin/cards','POST',{name:'Fusion Contract',cardType:'WRESTLER',rarity:'NORMAL',cost:1,attack:0,health:1,text:'합체. 공격불가.',keywords:['FUSION','CANNOT_ATTACK'],tags:[],isToken:false,isChampionToken:false,effectId:null,effectConfig:{}});
 assert.equal(created.status,201,JSON.stringify(created.body));assert.deepEqual(created.body.card.keywords,['FUSION','CANNOT_ATTACK']);
});
test('authoritative fusion accepts duplicate packets exactly once and restores the resulting state',async()=>{
 const {applyMatchAction,getRuntime,cleanupMatchRuntime}=await import('../../../artifacts/api-server/src/online/service');
 const champion=championRecordToDefinition(record);const state=createInitialGameState([champion.id,champion.id],undefined,[champion]);state.status='IN_PROGRESS';state.activePlayerId='PLAYER_ONE';
 state.players[0].id='PLAYER_ONE';state.players[1].id='PLAYER_TWO';state.players[0].currentGold=6;
 const material=cardRecordToDefinition({id:'http-fusion',name:'material',cardType:'WRESTLER',rarity:'NORMAL',cost:1,attack:0,health:1,text:'합체',keywords:['FUSION'],tags:[],isToken:false,isChampionToken:false,effectId:'STRUCTURED_EFFECTS_V1',effectConfig:{effects:[{trigger:'ON_FUSION',action:'DRAW',values:{amount:1}}]},status:'PUBLISHED',version:1} as any);
 const host={...material,id:'http-host',name:'host',attack:2,health:3,keywords:[],abilities:[{trigger:'ON_FUSION',effects:[{type:'DAMAGE_OPPONENT_CHAMPION',amount:1}]}]} as any;
 state.cardPool=[material,host];state.players[0].hand=[generateCardInstance(material,{instanceId:'http-material'})];state.players[0].board=[{...generateCardInstance(host,{instanceId:'http-host'}),boardSlot:0},null,null,null];state.players[0].deck=[generateCardInstance(host,{instanceId:'http-draw'})];state.players[1].board=[null,null,null,null];state.players[1].hand=[];state.players[1].deck=[];for(const player of state.players){player.graveyard=[];player.removedFromGame=[];}
 const matchId='feature-fusion-pvp';
 await database.insert(schema.onlineMatchesTable).values({id:matchId,status:'ACTIVE',player1UserId:'feature-admin',player2UserId:'feature-opponent',player1DeckId:'feature-deck1',player2DeckId:'feature-deck2',stateVersion:0,serializedGameState:state,serializedSnapshot:{player1UserId:'feature-admin',player2UserId:'feature-opponent',player1DeckId:'feature-deck1',player2DeckId:'feature-deck2',cardDefinitions:state.cardPool,championDefinitions:[champion],publicPlayers:[{seat:'PLAYER_ONE',nickname:'QA1'},{seat:'PLAYER_TWO',nickname:'QA2'}],introFirstSpeaker:null}});
 try{
 let runtime=await getRuntime(matchId);assert.ok(runtime);
 const play=await applyMatchAction(matchId,'feature-admin','fusion-play',runtime.version,{type:'PLAY_WRESTLER',cardInstanceId:'http-material',boardSlot:1} as any);assert.ok(play.ok,JSON.stringify(play));
 assert.equal(runtime.state.players[0].board[1]?.instanceId,'http-material');const before=JSON.stringify(runtime.state);cleanupMatchRuntime(matchId);runtime=await getRuntime(matchId);assert.ok(runtime);assert.deepEqual(runtime.state,JSON.parse(before));
 const version=runtime.version,payload={type:'SELECT_EFFECT_TARGET',targetId:'http-host'} as any;
 const results=await Promise.all([applyMatchAction(matchId,'feature-admin','fusion-select',version,payload),applyMatchAction(matchId,'feature-admin','fusion-select',version,payload)]);assert.ok(results.every(r=>r.ok),JSON.stringify(results));assert.equal(runtime.version,version+1);
 assert.equal(runtime.state.players[0].board[0]?.currentHealth,4);assert.equal(runtime.state.players[1].health,19);assert.equal(runtime.state.events.filter(e=>e.type==='CARD_VANISHED').length,1);assert.equal(runtime.state.players[0].hand.filter(c=>c.instanceId==='http-draw').length,1);assert.equal(runtime.state.players[0].graveyard.length,0);
 const snapshot=JSON.stringify(runtime.state);cleanupMatchRuntime(matchId);runtime=await getRuntime(matchId);assert.ok(runtime);assert.deepEqual(runtime.state,JSON.parse(snapshot));
 }finally{const runtime=await getRuntime(matchId);if(runtime){await runtime.queue;runtime.state={...runtime.state,status:'FINISHED'};cleanupMatchRuntime(matchId);}}
});
