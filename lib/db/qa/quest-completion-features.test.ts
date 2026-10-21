/** Local-only HTTP, real game-event progression and reward-transaction regression. */
import {PGlite} from '@electric-sql/pglite';import {drizzle} from 'drizzle-orm/pglite';
import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';import * as schema from '../src/schema';
import {test,after} from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {and,eq} from 'drizzle-orm';
import {createInitialGameState,generateCardInstance,executeAction,type GameState} from '../../game-engine/src';
process.env.DATABASE_URL='postgresql://unused:unused@127.0.0.1:1/unused';
const pg=new PGlite(),database=drizzle(pg,{schema});
for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await pg.exec(ddl);
await pg.exec(await readFile(new URL('../migrations/0033_server_maintenance.sql',import.meta.url),'utf8'));
const {db,pool}=await import('../src/index');for(const method of ['select','insert','update','delete','transaction','execute'] as const)Object.assign(db,{[method]:database[method].bind(database)});
const {hashPassword}=await import('../../../artifacts/api-server/src/lib/auth');
const {processMatchEventsForDailyQuests,ensureDailyQuestAssignments,dailyDate}=await import('../../../artifacts/api-server/src/lib/daily-quest-service');
const {claimDailyCompletionBonus,completedDailyQuestCount,DAILY_COMPLETION_BONUS_KEY}=await import('../../../artifacts/api-server/src/lib/daily-completion-bonus');
const {readPlatform}=await import('../../../artifacts/api-server/src/lib/quest-platform');
const password='QuestFeaturesLocal123';const cookies:Record<string,string>={};
for(const id of ['admin','user','fresh','rollback','browser','paused'])await database.insert(schema.usersTable).values({id,email:id+'@quest-features.invalid',nickname:'격리 '+id,passwordHash:await hashPassword(password),role:id==='admin'?'ADMIN':'USER',shopCurrencyStarterGrantedAt:new Date()});
const cards=[{id:'owned-wrestler',name:'보유 선수',cardType:'WRESTLER',rarity:'NORMAL',cost:1,tags:['아군','공용']},{id:'unowned-wrestler',name:'미보유 선수',cardType:'WRESTLER',rarity:'NORMAL',cost:2,tags:['미보유 전용','공용']},{id:'owned-technique',name:'보유 주문',cardType:'TECHNIQUE',rarity:'EPIC',cost:1,tags:['주문']},{id:'unowned-technique',name:'미보유 주문',cardType:'TECHNIQUE',rarity:'EPIC',cost:7,tags:['미보유 전용']}];
await database.insert(schema.cardsTable).values(cards.map(c=>({...c,attack:c.cardType==='WRESTLER'?2:0,health:c.cardType==='WRESTLER'?3:0,text:'효과 없음',status:'PUBLISHED'})));
await database.insert(schema.championsTable).values({id:'champion',name:'검증 챔피언',abilityName:'검증 능력',abilityEffects:{},status:'PUBLISHED'});
for(const userId of ['user','browser']){await database.insert(schema.userCardCollectionsTable).values(['owned-wrestler','owned-technique'].map(cardDefinitionId=>({userId,cardDefinitionId,quantity:2})));await database.insert(schema.userChampionCollectionsTable).values({userId,championDefinitionId:'champion',owned:true});}
await database.insert(schema.packDefinitionsTable).values({id:'five-card-pack',name:'개별 공개 검증 팩',cardsPerPack:5,normalCardPool:['owned-wrestler','unowned-wrestler'],normalRate:100,epicRate:0,legendaryRate:0,championRate:0,skinChance:0,status:'PUBLISHED'});
await database.insert(schema.userPackInventoryTable).values({userId:'browser',packDefinitionId:'five-card-pack',quantity:10});
const {default:app}=await import('../../../artifacts/api-server/src/app');
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.on('listening',r));const address=server.address();assert.ok(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
async function request(path:string,id='admin',method='GET',body?:unknown){const r=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookies[id]??''},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};}
for(const id of ['admin','user','fresh','rollback','browser','paused']){const r=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:id+'@quest-features.invalid',password})});assert.equal(r.status,200);cookies[id]=r.headers.get('set-cookie')!.split(';')[0]!;}
const input=(i:number)=>({title:'일일 검증 '+i,description:'선수 '+i+'장 사용',objectiveType:'WRESTLER_PLAYED',targetValue:i,enabled:true,platform:{questType:'DAILY',weight:100,modes:['AI','PVP','TOWER','DRAFT'],rewards:[{rewardType:'CURRENCY',rewardAmount:10,rewardTargetId:null}]}});
const ids:string[]=[];for(const i of [1,2,3]){const r=await request('/admin/quests/definitions','admin','POST',input(i));assert.equal(r.status,200);ids.push(r.body.definition.id);}
const states=new Map<string,GameState>();
function game(userId:string){let s=states.get(userId);if(s)return s;const d={id:'owned-wrestler',name:'보유 선수',cardType:'WRESTLER' as const,cost:1,attack:2,health:3,rulesText:'',keywords:[],abilities:[],isToken:false,isChampionToken:false};s=createInitialGameState(undefined,[d]);s.status='IN_PROGRESS';s.turn=3;s.events=[];s.activePlayerId='player-1';s.players[0].hand=Array.from({length:4},(_,i)=>generateCardInstance(d,{instanceId:userId+'-card-'+i}));s.players[0].board=[null,null,null,null];s.players[0].currentGold=10;s.players[0].champion.quest=null;states.set(userId,s);return s;}
async function advance(userId:string,date?:string){const s=game(userId),slot=s.players[0].board.filter(Boolean).length;const r=executeAction(s,{type:'PLAY_WRESTLER',playerId:'player-1',cardInstanceId:s.players[0].hand[0]!.instanceId,boardSlot:slot});assert.ok(r.success,r.message);states.set(userId,r.state);await database.transaction(tx=>processMatchEventsForDailyQuests(userId,'player-1','verified-'+userId,r.state,s.events.length,tx as any,date,'AI'));return r.state;}
const config={enabled:true,rewardType:'CURRENCY',rewardAmount:200,rewardTargetId:null};
const claim=(id='user',body?:unknown)=>request('/daily-quests/completion-bonus/claim',id,'POST',body);
const assignments=(id='user')=>request('/daily-quests',id);
test('bonus defaults off; only admin can configure/delete and malformed rewards are rejected',async()=>{
 assert.equal((await request('/admin/quests')).body.dailyCompletionBonus.enabled,false);
 assert.equal((await assignments()).body.completionBonus.status,'DISABLED');assert.equal((await claim()).status,422);
 assert.equal((await request('/admin/quests/completion-bonus','user','PUT',config)).status,403);
 assert.equal((await request('/admin/quests/definitions/'+ids[0],'user','DELETE')).status,403);
 assert.equal((await request('/admin/quests/definitions/'+ids[0],'','DELETE')).status,401);
 for(const p of [{...config,rewardAmount:0},{...config,rewardAmount:1.5},{...config,rewardType:'CHAMPION',rewardAmount:2,rewardTargetId:'champion'},{...config,rewardType:'PACK',rewardTargetId:'missing'}])assert.equal((await request('/admin/quests/completion-bonus','admin','PUT',p)).status,400);
 assert.equal((await request('/admin/quests/completion-bonus','admin','PUT',config)).status,200);
});
test('three distinct server-completed quests count before individual rewards are claimed; retry cannot duplicate progress',async()=>{
 assert.equal((await claim()).status,422);
 for(const i of [1,2,3]){const s=await advance('user');await database.transaction(tx=>processMatchEventsForDailyQuests('user','player-1','verified-user',s,0,tx as any,undefined,'AI'));const r=await assignments();assert.equal(r.body.completionBonus.progress,i);assert.equal(r.body.completionBonus.status,i===3?'COMPLETED':'IN_PROGRESS');if(i<3)assert.equal((await claim()).status,422);}
 assert.ok((await assignments()).body.assignments.filter((x:any)=>ids.includes(x.definitionId)).every((x:any)=>x.status==='COMPLETED'));
});
test('concurrent claims, forged amounts and changed reward type cannot pay twice on the same day',async()=>{
 const [before]=await database.select().from(schema.usersTable).where(eq(schema.usersTable.id,'user'));
 const r=await Promise.all([claim('user',{userId:'fresh',date:'2099-01-01',rewardAmount:999999}),claim()]);assert.ok(r.every(x=>x.status===200));assert.equal(r.filter(x=>!x.body.alreadyClaimed).length,1);
 const [after]=await database.select().from(schema.usersTable).where(eq(schema.usersTable.id,'user'));assert.equal(after.currencyBalance,before.currencyBalance+200);
 assert.equal((await request('/admin/quests/completion-bonus','admin','PUT',{...config,rewardType:'PACK',rewardAmount:1,rewardTargetId:'five-card-pack'})).status,200);
 const retry=await claim();assert.equal(retry.body.alreadyClaimed,true);assert.equal(retry.body.bonus.rewardType,'CURRENCY');assert.equal(retry.body.bonus.rewardAmount,200);
 assert.equal((await database.select().from(schema.rewardGrantsTable).where(and(eq(schema.rewardGrantsTable.userId,'user'),eq(schema.rewardGrantsTable.sourceType,DAILY_COMPLETION_BONUS_KEY)))).length,1);
});
test('season, lifetime, yesterday, repeated definitions and incomplete targets are excluded; midnight starts a new period',async()=>{
 const rows=(await database.select().from(schema.dailyQuestAssignmentsTable).where(eq(schema.dailyQuestAssignmentsTable.userId,'user')));const date=dailyDate();
 assert.equal(completedDailyQuestCount([...rows,...rows],date),3);
 assert.equal(completedDailyQuestCount(rows.map((x,i)=>({...x,assignmentDate:i===0?'LIFETIME':i===1?'2020-01-01':date,platform:i===2?{...readPlatform(x),questType:'SEASON'}:x.platform})),date),0);
 assert.equal(completedDailyQuestCount(rows.map(x=>({...x,progress:0})),date),0);
 assert.equal(dailyDate(new Date('2026-10-21T14:59:59Z'),'Asia/Seoul'),'2026-10-21');assert.equal(dailyDate(new Date('2026-10-21T15:00:00Z'),'Asia/Seoul'),'2026-10-22');
 await assert.rejects(()=>claimDailyCompletionBonus('user',database as any,new Date(Date.now()+86400000)),/3개/);
});
test('a new calendar day can grant again only after its own three verified completions',async()=>{
 const now=new Date(Date.now()+86400000),date=dailyDate(now);
 await database.transaction(tx=>processMatchEventsForDailyQuests('user','player-1','verified-user',game('user'),0,tx as any,date,'AI'));
 const result=await claimDailyCompletionBonus('user',database as any,now);assert.equal(result.alreadyClaimed,false);assert.equal(result.bonus.date,date);assert.equal(result.bonus.rewardType,'PACK');
 assert.equal((await claimDailyCompletionBonus('user',database as any,now)).alreadyClaimed,true);
 const grants=await database.select().from(schema.rewardGrantsTable).where(and(eq(schema.rewardGrantsTable.userId,'user'),eq(schema.rewardGrantsTable.sourceType,DAILY_COMPLETION_BONUS_KEY)));assert.equal(grants.length,2);
});
test('invalidated reward rolls back the claim; restoring it allows exactly one pack grant',async()=>{
 await assignments('rollback');for(let i=0;i<3;i++)await advance('rollback');
 await database.update(schema.packDefinitionsTable).set({status:'DISABLED'}).where(eq(schema.packDefinitionsTable.id,'five-card-pack'));
 assert.equal((await claim('rollback')).status,422);assert.equal((await database.select().from(schema.rewardGrantsTable).where(and(eq(schema.rewardGrantsTable.userId,'rollback'),eq(schema.rewardGrantsTable.sourceType,DAILY_COMPLETION_BONUS_KEY)))).length,0);
 await database.update(schema.packDefinitionsTable).set({status:'PUBLISHED'}).where(eq(schema.packDefinitionsTable.id,'five-card-pack'));
 assert.equal((await claim('rollback')).body.alreadyClaimed,false);assert.equal((await claim('rollback')).body.alreadyClaimed,true);
 const [pack]=await database.select().from(schema.userPackInventoryTable).where(eq(schema.userPackInventoryTable.userId,'rollback'));assert.equal(pack.quantity,1);
});
test('deleting a quest preserves assigned snapshots, their progression/rewards, FK history and the bonus count',async()=>{
 const old=(await assignments()).body.assignments.find((q:any)=>q.definitionId===ids[2]);
 const first=await request('/admin/quests/definitions/'+ids[2],'admin','DELETE');assert.equal(first.status,200);assert.equal(first.body.alreadyDeleted,false);
 assert.equal((await request('/admin/quests/definitions/'+ids[2],'admin','DELETE')).body.alreadyDeleted,true);
 assert.ok(!(await request('/admin/quests')).body.definitions.some((q:any)=>q.id===ids[2]));assert.ok(!(await request('/admin/rewards')).body.dailyQuests.some((q:any)=>q.id===ids[2]));
 assert.equal((await request('/admin/quests/definitions','admin','POST',{...input(3),id:ids[2]})).status,404);
 assert.equal((await request('/admin/rewards/daily-quests/'+ids[2],'admin','PATCH',input(3))).status,404);
 assert.equal((await request('/daily-quests/'+old.id+'/claim','user','POST')).status,200);
 assert.equal((await assignments()).body.completionBonus.progress,3);
 // Rollback user already completed; a newly assigned snapshot below will test in-flight deletion separately.
 assert.ok(!(await assignments('fresh')).body.assignments.some((q:any)=>q.definitionId===ids[2]));
 assert.equal((await database.select().from(schema.dailyQuestAssignmentsTable).where(eq(schema.dailyQuestAssignmentsTable.id,old.id))).length,1);
 assert.equal((await request('/admin/quests/definitions/missing','admin','DELETE')).status,404);
});
test('already-assigned incomplete quest still uses its original snapshot after deletion',async()=>{
 const active=(await assignments('fresh')).body.assignments.find((q:any)=>q.definitionId===ids[1]);assert.equal(active.progress,0);
 await request('/admin/quests/definitions/'+ids[1],'admin','DELETE');await advance('fresh');await advance('fresh');
 const preserved=(await assignments('fresh')).body.assignments.find((q:any)=>q.id===active.id);assert.equal(preserved.status,'COMPLETED');assert.equal(preserved.targetValue,2);assert.equal((await request('/daily-quests/'+active.id+'/claim','fresh','POST')).status,200);
});
test('deleting an already disabled quest does not reactivate old assignments',async()=>{
 const assignment=(await assignments('paused')).body.assignments.find((q:any)=>q.definitionId===ids[0]);assert.equal(assignment.progress,0);
 await request('/admin/quests/definitions','admin','POST',{...input(1),id:ids[0],enabled:false});
 await request('/admin/quests/definitions/'+ids[0],'admin','DELETE');await advance('paused');
 const row=(await assignments('paused')).body.assignments.find((q:any)=>q.id===assignment.id);assert.equal(row.progress,0);assert.equal((await request('/daily-quests/'+row.id+'/claim','paused','POST')).status,422);
});
after(async()=>{
 if(process.env.KO_QUEST_FEATURES_BROWSER==='1'){
  // New browser account gets three fresh definitions, then real actions can progress them.
  for(const i of [1,2,3]){const r=await request('/admin/quests/definitions','admin','POST',{...input(i),title:'브라우저 일일 '+i});assert.equal(r.status,200);}
  await assignments('browser');
  app.post('/__qa/quest-features/advance',async(_req,res,next)=>{try{await advance('browser');res.json({ok:true});}catch(e){next(e);}});
  await mkdir('qa-results/quest-completion',{recursive:true});await writeFile('qa-results/quest-completion/fixture.json',JSON.stringify({origin,cookies}));console.log('QUEST_FEATURES_BROWSER_READY');
  await new Promise<void>(resolve=>{const timer=setTimeout(resolve,300000);process.once('SIGTERM',()=>{clearTimeout(timer);resolve();});});
 }
 await new Promise<void>(resolve=>server.close(()=>resolve()));await pg.close();await pool.end();
});
