
import test,{after} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {generateDrizzleJson,generateMigration} from "drizzle-kit/api";
import * as schema from "../src/schema";
import {eq} from "drizzle-orm";
import {getLegalActions,executeAction,chooseBestAction,type GameState} from "../../game-engine/src";
process.env.DATABASE_URL="postgresql://unused:unused@127.0.0.1:1/unused";
process.env.NODE_ENV="development";
const pg=new PGlite(),database=drizzle(pg,{schema});
for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await pg.exec(ddl);
await pg.exec(await readFile(new URL("../migrations/0033_server_maintenance.sql",import.meta.url),"utf8"));
await pg.exec(await readFile(new URL("../migrations/0050_daily_season_quest_platform.sql",import.meta.url),"utf8"));
await database.insert(schema.packDefinitionsTable).values({id:"qa-pack",name:"QA Pack",status:"PUBLISHED",starterRewardQuantity:1});
const {db,pool}=await import("../src/index");
for(const method of ["select","insert","update","delete","transaction","execute"] as const)Object.assign(db,{[method]:database[method].bind(database)});
const {hashPassword}=await import("../../../artifacts/api-server/src/lib/auth");
const password="QuestFixture12345";
await database.insert(schema.usersTable).values([
 {id:"quest-admin",email:"admin@quest.invalid",nickname:"퀘스트 관리자",passwordHash:await hashPassword(password),role:"ADMIN"},
 {id:"quest-existing",email:"existing@quest.invalid",nickname:"기존 일반 사용자",passwordHash:await hashPassword(password),role:"USER"}
]);
const {default:app}=await import("../../../artifacts/api-server/src/app");
const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.on("listening",r));
const address=server.address();assert.ok(address&&typeof address==="object");const origin="http://127.0.0.1:"+address.port;
after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await pg.close();await pool.end();});
function session(){let cookie="";return {async request(path:string,method="GET",body?:unknown){
 const res=await fetch(origin+"/api"+path,{method,headers:{"Content-Type":"application/json",Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
 const set=res.headers.get("set-cookie");if(set)cookie=set.split(";")[0];
 return {status:res.status,body:await res.json()};
}};}
const admin=session(),a=session(),b=session(),aDevice2=session(),anonymous=session();
let dailyId="",seasonId="",seasonQuestId="",userB="";
const input={title:"선수 3장",description:"AI 또는 PvP에서 선수 카드 3장 사용",objectiveType:"WRESTLER_PLAYED",targetValue:3,cardType:null,enabled:true,platform:{questType:"DAILY",modes:["AI","PVP"],weight:100,rewards:[{rewardType:"CURRENCY",rewardAmount:100,rewardTargetId:null}]}};
async function definitions(){return (await admin.request("/admin/quests")).body.definitions;}
async function quests(client:ReturnType<typeof session>){const r=await client.request("/daily-quests");assert.equal(r.status,200,JSON.stringify(r.body));return r.body.assignments;}
async function setupDeck(userId:string){
 const ids=Array.from({length:9},(_,i)=>"quest-card-"+i),cards=ids.flatMap(id=>[id,id,id]).slice(0,25);
 await database.insert(schema.userCardCollectionsTable).values(ids.map(cardDefinitionId=>({userId,cardDefinitionId,quantity:3}))).onConflictDoUpdate({target:[schema.userCardCollectionsTable.userId,schema.userCardCollectionsTable.cardDefinitionId],set:{quantity:3}});
 await database.insert(schema.userChampionCollectionsTable).values({userId,championDefinitionId:"quest-champion",owned:true}).onConflictDoNothing();
 await database.insert(schema.decksTable).values({id:userId+"-deck",userId,name:"QA Deck",championDefinitionId:"quest-champion",cardDefinitionIds:cards});
}
async function match(client:ReturnType<typeof session>,userId:string,win=false){
 const matchId="ai-"+randomUUID(),identity={matchId,deckId:userId+"-deck",aiDeckId:"quest-ai"};
 const start=await client.request("/daily-quests/ai-match-start","POST",identity);assert.equal(start.status,200,JSON.stringify(start.body));
 let state=start.body.state as GameState;const playerId=state.players[0].id,aiId=state.players[1].id,actions:any[]=[];

 for(let i=0;i<500 && state.status!=="FINISHED";i++){
  const actor=state.openingMulligan ? state.players.find(p=>!p.mulliganUsed)!.id : state.targetingState?.active ? state.targetingState.playerId : state.activePlayerId;
  const legal=getLegalActions(state,actor).filter(x=>x.type!=="SURRENDER"&&x.type!=="EMOTE");
  const action=legal.find(x=>x.type==="MULLIGAN")??((win||actor===aiId)?chooseBestAction(state,legal,actor):legal.find(x=>x.type==="PLAY_WRESTLER")??legal.find(x=>x.type==="END_TURN"));
  assert.ok(action,"legal action missing");
  const r=executeAction(state,action);assert.ok(r.success);state=r.state;actions.push({...action,...(actor===aiId?{actor:"AI"}:{})});
  if(!win&&actor===playerId&&action.type==="PLAY_WRESTLER"){const surrender={type:"SURRENDER",playerId};actions.push(surrender);state=executeAction(state,surrender as any).state;break;}
 }
 assert.equal(state.status,"FINISHED");
 const result=await client.request("/daily-quests/ai-match-progress","POST",{...identity,outcome:state.winnerId===playerId?"WIN":"LOSS",actions});
 assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.completed,true,JSON.stringify(result.body));
 const again=await client.request("/daily-quests/ai-match-progress","POST",{...identity,outcome:state.winnerId===playerId?"WIN":"LOSS",actions});assert.equal(again.body.completed,true);
 return state.winnerId===playerId;
}
test("admin-only configuration; existing and fresh ordinary accounts initialize without quest rows",async()=>{
 assert.equal((await anonymous.request("/daily-quests")).status,401);
 assert.equal((await admin.request("/auth/login","POST",{email:"admin@quest.invalid",password})).status,200);
 assert.equal((await a.request("/auth/login","POST",{email:"existing@quest.invalid",password})).body.user.role,"USER");
 const created=await b.request("/auth/register","POST",{email:"fresh@quest.invalid",nickname:"새 일반 사용자",password,passwordConfirmation:password});
 assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.user.role,"USER");userB=created.body.user.id;
 assert.equal((await a.request("/admin/quests")).status,403);
 assert.equal((await a.request("/admin/quests/definitions","POST",input)).status,403);
 assert.equal((await b.request("/admin/quests/settings","PUT",{dailyCount:5,timezone:"UTC"})).status,403);
 let r=await admin.request("/admin/quests/definitions","POST",input);assert.equal(r.status,200,JSON.stringify(r.body));dailyId=r.body.definition.id;
 r=await admin.request("/admin/quests/seasons","POST",{name:"QA Season",startsAt:"2020-01-01T00:00:00+09:00",endsAt:"2099-12-31T23:59:00+09:00",status:"ACTIVE"});assert.equal(r.status,200);seasonId=r.body.season.id;
 r=await admin.request("/admin/quests/definitions","POST",{...input,title:"시즌 10승",objectiveType:"WIN_MATCH",targetValue:10,platform:{...input.platform,questType:"SEASON",seasonId,rewards:[{rewardType:"PACK",rewardAmount:1,rewardTargetId:"qa-pack"}]}});assert.equal(r.status,200);seasonQuestId=r.body.definition.id;
 for(const c of [admin,a,b]){const q=await quests(c);assert.ok(q.some((x:any)=>x.definitionId===dailyId));assert.ok(q.some((x:any)=>x.definitionId===seasonQuestId));assert.ok(q.every((x:any)=>x.progress===0));}
 assert.equal((await a.request("/admin/quests/definitions","POST",{...input,id:dailyId,title:"hack"})).status,403);
});
test("diagnostics are read-only, validation rejects invalid data and KST midnight resets",async()=>{
 const before=await database.select().from(schema.dailyQuestAssignmentsTable);
 const diagnostic=await admin.request("/admin/quests/diagnostic","POST",{objectiveType:"CARD_PLAYED",amount:1,mode:"AI",cardType:"WRESTLER",rarity:"NORMAL",result:"WIN"});
 assert.equal(diagnostic.body.readOnly,true);assert.equal(diagnostic.body.results.find((x:any)=>x.id===dailyId).increment,1);
 assert.deepEqual(await database.select().from(schema.dailyQuestAssignmentsTable),before);
 for(const bad of [{targetValue:0},{objectiveType:"BAD"},{platform:{...input.platform,modes:[]}},{platform:{...input.platform,rewards:[{rewardType:"CURRENCY",rewardAmount:-1}]}},{platform:{...input.platform,questType:"SEASON",seasonId:null}}])assert.equal((await admin.request("/admin/quests/definitions","POST",{...input,...bad})).status,400);
 const {dailyDate}=await import("../../../artifacts/api-server/src/lib/daily-quest-service");
 assert.equal(dailyDate(new Date("2026-10-08T14:59:59Z")),"2026-10-08");assert.equal(dailyDate(new Date("2026-10-08T15:00:00Z")),"2026-10-09");
});
test("ordinary AI HTTP play progresses daily+season independently; claims cannot cross ownership",async()=>{
 const ids=Array.from({length:9},(_,i)=>"quest-card-"+i);
 await database.insert(schema.cardsTable).values(ids.map(id=>({id,name:id,cardType:"WRESTLER",cost:1,attack:12,health:12,keywords:["RUSH"],text:"",status:"PUBLISHED",rarity:"NORMAL"})));
 await database.insert(schema.championsTable).values({id:"quest-champion",name:"Quest Champion",maxHealth:10,abilityName:"Ability",abilityText:"",abilityCost:1,abilityEffects:{},status:"PUBLISHED"});
 await database.insert(schema.aiDecksTable).values({id:"quest-ai",name:"QA AI",championDefinitionId:"quest-champion",cardDefinitionIds:ids.flatMap(id=>[id,id,id]).slice(0,25),enabled:true});
 await setupDeck("quest-existing");await setupDeck(userB);
 const qa=(await quests(a)).find((x:any)=>x.definitionId===dailyId),qb=(await quests(b)).find((x:any)=>x.definitionId===dailyId);
 for(let i=1;i<=3;i++){await match(a,"quest-existing");assert.equal((await quests(a)).find((x:any)=>x.id===qa.id).progress,i);assert.equal((await quests(b)).find((x:any)=>x.id===qb.id).progress,0);}
 assert.equal((await b.request("/daily-quests/"+qa.id+"/claim","POST")).status,422);
 const balance=await database.select().from(schema.usersTable);const aBefore=balance.find(u=>u.id==="quest-existing")!.currencyBalance,bBefore=balance.find(u=>u.id===userB)!.currencyBalance;
 const claims=await Promise.all([a.request("/daily-quests/"+qa.id+"/claim","POST",{rewardAmount:999999,userId:userB}),a.request("/daily-quests/"+qa.id+"/claim","POST")]);
 assert.ok(claims.some(c=>c.body.alreadyClaimed===false));assert.ok(claims.some(c=>c.body.alreadyClaimed===true));
 assert.equal((await database.select().from(schema.usersTable).where(eq(schema.usersTable.id,"quest-existing")))[0].currencyBalance,aBefore+100);
 assert.equal((await database.select().from(schema.usersTable).where(eq(schema.usersTable.id,userB)))[0].currencyBalance,bBefore);
 for(let i=0;i<3;i++)await match(b,userB);
 assert.equal((await b.request("/daily-quests/"+qb.id+"/claim","POST")).status,200);
 assert.equal((await database.select().from(schema.usersTable).where(eq(schema.usersTable.id,userB)))[0].currencyBalance,bBefore+100);
 assert.equal((await aDevice2.request("/auth/login","POST",{email:"existing@quest.invalid",password})).status,200);
 assert.equal((await quests(aDevice2)).find((x:any)=>x.id===qa.id).status,"CLAIMED");
});
test("season ten wins via authenticated AI replay persists across days and pays one pack only",async()=>{
 let wins=0;
 for(let i=0;i<30&&wins<10;i++)if(await match(a,"quest-existing",true))wins++;
 assert.equal(wins,10);
 const quest=(await quests(a)).find((x:any)=>x.definitionId===seasonQuestId);assert.equal(quest.progress,10);assert.equal(quest.status,"COMPLETED");
 const {ensureDailyQuestAssignments,ensureSeasonQuestAssignments}=await import("../../../artifacts/api-server/src/lib/daily-quest-service");
 await db.transaction(async tx=>{await ensureDailyQuestAssignments("quest-existing","2026-10-09",tx);const q=await ensureSeasonQuestAssignments("quest-existing",tx,new Date("2026-10-09T00:00:00Z"));assert.equal(q.find(x=>x.id===quest.id)?.progress,10);});
 const before=(await database.select().from(schema.userPackInventoryTable).where(eq(schema.userPackInventoryTable.userId,"quest-existing"))).find(x=>x.packDefinitionId==="qa-pack")?.quantity??0;
 assert.equal((await a.request("/daily-quests/"+quest.id+"/claim","POST")).body.alreadyClaimed,false);
 assert.equal((await a.request("/daily-quests/"+quest.id+"/claim","POST")).body.alreadyClaimed,true);
 assert.equal((await database.select().from(schema.userPackInventoryTable).where(eq(schema.userPackInventoryTable.userId,"quest-existing"))).find(x=>x.packDefinitionId==="qa-pack")?.quantity,before+1);
 assert.equal((await quests(b)).find((x:any)=>x.definitionId===seasonQuestId).progress,0);
});
test("snapshot immutability, late season distribution, disable and archive preserve all user history",async()=>{
 const before=(await quests(b)).find((x:any)=>x.definitionId===seasonQuestId);
 let def=(await definitions()).find((d:any)=>d.id===seasonQuestId);
 await admin.request("/admin/quests/definitions","POST",{...def,title:"Changed",targetValue:20,platform:{...def.platform,rewards:[{rewardType:"CURRENCY",rewardAmount:200,rewardTargetId:null}]}});
 const after=(await quests(b)).find((x:any)=>x.id===before.id);assert.equal(after.targetValue,10);assert.equal(after.rewardType,"PACK");assert.equal(after.title,"시즌 10승");
 const late=await admin.request("/admin/quests/definitions","POST",{...input,title:"시즌 합체",objectiveType:"FUSION",platform:{...input.platform,questType:"SEASON",seasonId}});
 assert.equal(late.status,200);assert.ok((await quests(a)).some((x:any)=>x.definitionId===late.body.definition.id));
 await quests(b);
 const count=(await database.select().from(schema.dailyQuestAssignmentsTable)).length;
 def=(await definitions()).find((d:any)=>d.id===seasonQuestId);
 assert.equal((await admin.request("/admin/quests/definitions","POST",{...def,enabled:false,platform:{...def.platform,archived:true}})).status,200);
 assert.ok((await quests(b)).some((x:any)=>x.id===before.id));
 assert.equal((await database.select().from(schema.dailyQuestAssignmentsTable)).length,count);
 assert.ok((await admin.request("/admin/quests")).body.audits.length>=5);
 const {ensureSeasonQuestAssignments}=await import("../../../artifacts/api-server/src/lib/daily-quest-service");
 assert.equal((await ensureSeasonQuestAssignments(userB,database as any,new Date("2100-01-01"))).length,0);
});

test("one trusted event advances daily+season; filters, two same-type rewards and rollback are safe",async()=>{
 const daily=(await definitions()).find((d:any)=>d.id===dailyId);
 const created=await admin.request("/admin/quests/definitions","POST",{...input,title:"시즌 선수 사용",targetValue:20,platform:{...input.platform,questType:"SEASON",seasonId,rewards:[{rewardType:"CURRENCY",rewardAmount:25,rewardTargetId:null},{rewardType:"CURRENCY",rewardAmount:30,rewardTargetId:null},{rewardType:"PACK",rewardAmount:1,rewardTargetId:"qa-pack"},{rewardType:"CARD",rewardAmount:1,rewardTargetId:"quest-card-0"}]}});
 assert.equal(created.status,200);const id=created.body.definition.id;
 await quests(a);await match(a,"quest-existing");
 let q=(await quests(a)).find((x:any)=>x.definitionId===id);assert.equal(q.progress,1);
 const {processMatchEventsForDailyQuests}=await import("../../../artifacts/api-server/src/lib/daily-quest-service");
 const {createInitialGameState}=await import("../../game-engine/src");
 const state=createInitialGameState();state.events=[{type:"CARD_PLAYED",playerId:"player-1",cardType:"WRESTLER",cardDefinitionId:"quest-card-0"}];
 await db.transaction(tx=>processMatchEventsForDailyQuests("quest-existing","player-1","wrong-mode",state,0,tx,undefined,"TOWER"));
 assert.equal((await quests(a)).find((x:any)=>x.id===q.id).progress,1);
 const {questDiagnostic,readPlatform}=await import("../../../artifacts/api-server/src/lib/quest-platform");
 const sample={...daily,platform:{...readPlatform(daily),rarity:"EPIC",result:"WIN"}};
 assert.equal(questDiagnostic(sample,state.events[0],"player-1","AI","LOSS","EPIC").increment,0);
 assert.equal(questDiagnostic(sample,state.events[0],"player-1","AI","WIN","NORMAL").increment,0);
 assert.equal(questDiagnostic(sample,state.events[0],"player-1","AI","WIN","EPIC").increment,1);
 assert.equal(questDiagnostic({...sample,objectiveType:"FUSION"}, {type:"FUSION",playerId:"player-1",reason:"FUSION_TARGET"},"player-1","AI","WIN","EPIC").increment,0);
 // Complete with trusted engine events only; repeated occurrence IDs do not double count.
 state.events=Array.from({length:19},()=>({type:"CARD_PLAYED" as const,playerId:"player-1",cardType:"WRESTLER" as const}));
 await db.transaction(tx=>processMatchEventsForDailyQuests("quest-existing","player-1","multi-events",state,0,tx));
 q=(await quests(a)).find((x:any)=>x.id===q.id);assert.equal(q.progress,20);
 const initial=(await database.select().from(schema.usersTable).where(eq(schema.usersTable.id,"quest-existing")))[0].currencyBalance;
 // Fault injection of an unavailable later reward must roll back preceding credits too.
 await database.update(schema.dailyQuestAssignmentsTable).set({platform:{...q.platform,rewards:[...q.platform.rewards,{rewardType:"PACK",rewardAmount:1,rewardTargetId:"missing-pack"}]}}).where(eq(schema.dailyQuestAssignmentsTable.id,q.id));
 assert.equal((await a.request("/daily-quests/"+q.id+"/claim","POST")).status,422);
 assert.equal((await database.select().from(schema.usersTable).where(eq(schema.usersTable.id,"quest-existing")))[0].currencyBalance,initial);
 assert.equal((await quests(a)).find((x:any)=>x.id===q.id).status,"COMPLETED");
 await database.update(schema.dailyQuestAssignmentsTable).set({platform:q.platform}).where(eq(schema.dailyQuestAssignmentsTable.id,q.id));
 const r=await a.request("/daily-quests/"+q.id+"/claim","POST");assert.equal(r.status,200);assert.equal((await database.select().from(schema.usersTable).where(eq(schema.usersTable.id,"quest-existing")))[0].currencyBalance,initial+55);
 assert.equal((await a.request("/daily-quests/"+q.id+"/claim","POST")).body.alreadyClaimed,true);
 const disabled=await admin.request("/admin/quests/definitions","POST",{...created.body.definition,enabled:false});assert.equal(disabled.status,200);
 const existing=(await quests(b)).find((x:any)=>x.definitionId===id);assert.equal(existing,undefined,"disabled before initial distribution is excluded");
 const {selectDailyQuestDefinitions}=await import("../../../artifacts/api-server/src/lib/daily-quest-service");
 let heavy=0;for(let n=0;n<1000;n++){const selected=selectDailyQuestDefinitions([{id:"heavy",platform:{weight:100}},{id:"light",platform:{weight:1}}],"u"+n,"2026-10-08",1);if(selected[0].id==="heavy")heavy++;}
 assert.ok(heavy>950,"weights affect distribution: "+heavy);
});

test("PvP authenticated action persists one event for the actor only and retry cannot repeat progress",async()=>{
 const {createInitialGameState,cardRecordToDefinition,championRecordToDefinition,generateCardInstance}=await import("../../game-engine/src");
 const {getRuntime,cleanupMatchRuntime}=await import("../../../artifacts/api-server/src/online/service");
 const card=cardRecordToDefinition((await database.select().from(schema.cardsTable).where(eq(schema.cardsTable.id,"quest-card-0")))[0]);
 const champion=championRecordToDefinition((await database.select().from(schema.championsTable).where(eq(schema.championsTable.id,"quest-champion")))[0]);
 const state=createInitialGameState([champion.id,champion.id],[card],[champion]);state.players[0].id="PLAYER_ONE";state.players[1].id="PLAYER_TWO";state.status="IN_PROGRESS";state.turn=2;state.activePlayerId="PLAYER_ONE";state.openingMulligan=false;
 for(const p of state.players){p.mulliganUsed=true;p.board=[null,null,null,null];p.currentGold=6;p.hand=[generateCardInstance(card,{instanceId:p.id+"-card"})];}
 const id="quest-pvp";
 await database.insert(schema.onlineMatchesTable).values({id,status:"ACTIVE",player1UserId:"quest-existing",player2UserId:userB,player1DeckId:"quest-existing-deck",player2DeckId:userB+"-deck",stateVersion:0,serializedGameState:state,serializedSnapshot:{player1UserId:"quest-existing",player2UserId:userB,player1DeckId:"quest-existing-deck",player2DeckId:userB+"-deck",cardDefinitions:[card],championDefinitions:[champion],publicPlayers:[{seat:"PLAYER_ONE",nickname:"A"},{seat:"PLAYER_TWO",nickname:"B"}],introFirstSpeaker:null}});
 const definition=await admin.request("/admin/quests/definitions","POST",{...input,title:"PvP 선수",targetValue:5,platform:{...input.platform,questType:"SEASON",seasonId,modes:["PVP"]}});assert.equal(definition.status,200);
 const qa=(await quests(a)).find((x:any)=>x.definitionId===definition.body.definition.id),qb=(await quests(b)).find((x:any)=>x.definitionId===definition.body.definition.id);
 const payload={requestId:"pvp-play",expectedVersion:0,action:{type:"PLAY_WRESTLER",cardInstanceId:"PLAYER_ONE-card",boardSlot:0}};
 const result=await a.request("/online-matches/"+id+"/action","POST",payload);assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal((await quests(a)).find((x:any)=>x.id===qa.id).progress,1);assert.equal((await quests(b)).find((x:any)=>x.id===qb.id).progress,0);
 assert.equal((await a.request("/online-matches/"+id+"/action","POST",payload)).status,200);
 assert.equal((await quests(a)).find((x:any)=>x.id===qa.id).progress,1);
 const runtime=await getRuntime(id);assert.ok(runtime);runtime.state={...runtime.state,status:"FINISHED"};cleanupMatchRuntime(id);
});

test("clean browser profiles: admin editor saves and ordinary users see/claim through real API",{skip:!process.env.QUEST_PLAYWRIGHT_MODULE},async()=>{
 const {createRequire}=await import("node:module");
 const express=createRequire(new URL("../../../artifacts/api-server/package.json",import.meta.url))("express");
 const {fileURLToPath}=await import("node:url");
 const publicPath=fileURLToPath(new URL("../../../artifacts/ko-game/dist/public/",import.meta.url));
 app.use(express.static(publicPath));app.use((_req,res)=>res.sendFile(publicPath+"index.html"));
 const {chromium}=await import(process.env.QUEST_PLAYWRIGHT_MODULE!);
 const browser=await chromium.launch({channel:process.env.KO_QA_CHROME_CHANNEL??"chrome",headless:true});
 try{
  await admin.request("/admin/quests/settings","PUT",{dailyCount:20,timezone:"Asia/Seoul"});
  for(const width of [1440,390,320]){
   const adminContext=await browser.newContext({viewport:{width,height:900}});
   await adminContext.request.post(origin+"/api/auth/login",{data:{email:"admin@quest.invalid",password}});
   const page=await adminContext.newPage();const errors:string[]=[];page.on("pageerror",(e:Error)=>errors.push(e.message));
   await page.goto(origin+"/admin/quests");await page.getByRole("heading",{name:"퀘스트 관리",exact:true}).waitFor();
   await page.getByRole("button",{name:"새 퀘스트",exact:true}).click();
   await page.getByLabel("이름",{exact:true}).fill("브라우저 일일 "+width);
   await page.getByRole("button",{name:"미리보기",exact:true}).click();await page.getByLabel("모바일 퀘스트 미리보기").waitFor();
   await page.getByRole("button",{name:"저장",exact:true}).click();await page.getByRole("status").filter({hasText:"저장했습니다"}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"admin overflow at "+width);
   await page.screenshot({path:"../quest-admin-"+width+".png",fullPage:true});
   await adminContext.close();
   const context=await browser.newContext({viewport:{width,height:900}});
   await context.request.post(origin+"/api/auth/login",{data:{email:"existing@quest.invalid",password}});
   const user=await context.newPage();user.on("pageerror",(e:Error)=>errors.push(e.message));
   await user.goto(origin+"/daily-quests");await user.getByRole("heading",{name:"퀘스트",exact:true}).waitFor();
   await match(a,"quest-existing");
   await user.reload();
   const article=user.locator("article").filter({has:user.getByRole("heading",{name:"브라우저 일일 "+width,exact:true})});
   await article.getByRole("button",{name:"보상 받기",exact:true}).click();
   await article.getByRole("button",{name:"수령 완료",exact:true}).waitFor();
   await user.getByRole("button",{name:"시즌 퀘스트",exact:true}).click();await user.getByRole("heading",{name:"시즌 선수 사용",exact:true}).waitFor();
   assert.ok(await user.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"user overflow at "+width);
   await user.screenshot({path:"../quest-user-"+width+".png",fullPage:true});
   const forbidden=await context.request.post(origin+"/api/admin/quests/definitions",{data:input});assert.equal(forbidden.status(),403);
   assert.deepEqual(errors,[]);
   await context.close();
  }
 }finally{await browser.close();}
});
