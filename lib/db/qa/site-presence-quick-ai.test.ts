/** Real local HTTP/WebSocket + isolated PostgreSQL-compatible DB. No production access. */
import test,{after} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';import {drizzle} from 'drizzle-orm/pglite';import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';import {eq} from 'drizzle-orm';import * as schema from '../src/schema';
process.env.DATABASE_URL='postgresql://unused:unused@127.0.0.1:1/unused';process.env.NODE_ENV='development';
const pg=new PGlite();const originalQuery=pg.query.bind(pg);pg.query=(async(...args:any[])=>{try{return await (originalQuery as any)(...args);}catch(e){console.error('LOCAL PG ERROR',(e as Error).message);throw e;}}) as typeof pg.query;const queries:string[]=[];const database=drizzle(pg,{schema,logger:{logQuery(q){queries.push(q);}}});
for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await pg.exec(ddl);
for(const path of ['0033_server_maintenance.sql','0053_cosmetics.sql'])await pg.exec(await readFile(new URL('../migrations/'+path,import.meta.url),'utf8'));
const {db,pool}=await import('../src/index');for(const m of ['select','insert','update','delete','transaction','execute'] as const)Object.assign(db,{[m]:database[m].bind(database)});
const {default:app}=await import('../../../artifacts/api-server/src/app');
const server=app.listen(process.env.KO_QUICK_BROWSER_MODE==='1'?Number(process.env.KO_QUICK_FIXTURE_PORT??5291):0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();assert.ok(address&&typeof address==='object');const origin='http://127.0.0.1:'+address.port;
const {attachOnlineMatchWebSocket}=await import('../../../artifacts/api-server/src/online/websocket');attachOnlineMatchWebSocket(server);
const require=createRequire(new URL('../../../artifacts/api-server/package.json',import.meta.url));const {WebSocket}=require('ws');
const users=['a','b','c','cancel','stale'];const cookies:Record<string,string>={};
const cards=Array.from({length:9},(_,i)=>({id:'presence-card-'+i,name:'검증 선수 '+i,cardType:'WRESTLER',cost:1,attack:1,health:10,text:'효과 없음',rarity:'NORMAL',status:'PUBLISHED'}));
await database.insert(schema.cardsTable).values(cards);await database.insert(schema.championsTable).values({id:'presence-champion',name:'검증 챔피언',maxHealth:25,abilityName:'휴식',abilityCost:0,abilityText:'',abilityEffects:{effects:[]},status:'PUBLISHED'});
const ids=cards.flatMap((c,i)=>Array(i<8?3:1).fill(c.id));
for(const id of users){const token='presence-local-'+id;cookies[id]='ko_session='+token;
 await database.insert(schema.usersTable).values({id,email:id+'@presence.invalid',nickname:'유저 '+id,passwordHash:'disabled-local-password',role:'USER'});
 await database.insert(schema.sessionsTable).values({id:'presence-session-'+id,userId:id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+86400000)});
 await database.insert(schema.userCardCollectionsTable).values(cards.map(c=>({userId:id,cardDefinitionId:c.id,quantity:3})));
 await database.insert(schema.userChampionCollectionsTable).values({userId:id,championDefinitionId:'presence-champion',owned:true});
 await database.insert(schema.decksTable).values({id:'deck-'+id,userId:id,name:'검증 덱',championDefinitionId:'presence-champion',cardDefinitionIds:ids,isSelected:true});
}
await database.insert(schema.aiDecksTable).values({id:'existing-ai',name:'기존 덱 상대',championDefinitionId:'presence-champion',cardDefinitionIds:ids,enabled:true,displayOrder:1});
await database.insert(schema.rewardSettingsTable).values({key:'MATCH_ONLINE_LOSS',rewardType:'CURRENCY',amount:17,enabled:true});
const sockets:any[]=[];
function socket(user:string,autoPong=true){const s=new WebSocket(origin.replace('http','ws')+'/api/online-matches/ws',{headers:{cookie:cookies[user]},autoPong});s.messages=[];s.on('message',(raw:any)=>s.messages.push(JSON.parse(raw.toString())));s.on('error',()=>{});sockets.push(s);return s;}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));async function until(fn:()=>boolean,timeout=10000){const start=Date.now();while(!fn()){assert.ok(Date.now()-start<timeout,'timed out waiting for real server event');await pause(20);}}
const lastPresence=(s:any)=>s.messages.filter((m:any)=>m.type==='SITE_PRESENCE').at(-1)?.otherUsersOnline;
async function api(user:string,path:string,method='GET',body?:unknown){const r=await fetch(origin+'/api'+path,{method,headers:{cookie:cookies[user]??'','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()};}
after(async()=>{if(process.env.KO_QUICK_BROWSER_MODE==='1'){await mkdir('qa-results/site-presence-quick-ai',{recursive:true});await writeFile('qa-results/site-presence-quick-ai/fixture.json',JSON.stringify({origin,cookies}));console.log('QUICK_AI_BROWSER_READY');await new Promise<void>(r=>process.once('SIGTERM',r));}for(const s of sockets)s.terminate();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await pool.end();await pg.close();});
test('site-wide identity presence is private, deduplicates tabs, updates disconnects and does not poll DB',async()=>{
 const a=socket('a');await until(()=>lastPresence(a)===false);const a2=socket('a');await until(()=>lastPresence(a2)===false);assert.equal(lastPresence(a),false);
 const b=socket('b');await until(()=>lastPresence(a)===true&&lastPresence(a2)===true&&lastPresence(b)===true);
 b.close();await until(()=>lastPresence(a)===false);a.close();await pause(80);assert.equal(lastPresence(a2),false);
 const before=queries.length;await pause(1100);assert.equal(queries.length,before,'idle presence has zero DB queries');
 for(const message of a2.messages.filter((m:any)=>m.type==='SITE_PRESENCE'))assert.deepEqual(Object.keys(message).sort(),['otherUsersOnline','type']);
 a2.close();await pause(80);
});
test('actual 30-second deadline: PvP wins before deadline, cancel prevents fallback, duplicate joins do not reset timer, AI uses existing policy', {timeout:90000},async()=>{
 const a=socket('a'),b=socket('b');await until(()=>a.readyState===1&&b.readyState===1);
 a.send(JSON.stringify({type:'JOIN_QUICK_QUEUE',deckId:'deck-a'}));await until(()=>a.messages.some((m:any)=>m.type==='QUICK_QUEUE_JOINED'));
 b.send(JSON.stringify({type:'JOIN_QUICK_QUEUE',deckId:'deck-b'}));await until(()=>a.messages.some((m:any)=>m.type==='MATCH_FOUND')&&b.messages.some((m:any)=>m.type==='MATCH_FOUND'));
 const matchId=a.messages.find((m:any)=>m.type==='MATCH_FOUND').matchId;
 const {getRuntime,applyMatchAction,cleanupMatchRuntime}=await import('../../../artifacts/api-server/src/online/service');const runtime=await getRuntime(matchId);assert.ok(runtime);
 await pause(4700);const result=await applyMatchAction(matchId,'a','end-local',runtime.version,{type:'SURRENDER'});assert.equal(result.ok,true,result.ok?'':result.message);cleanupMatchRuntime(matchId);a.close();b.close();
 const cancel=socket('cancel');await until(()=>cancel.readyState===1);cancel.send(JSON.stringify({type:'JOIN_QUICK_QUEUE',deckId:'deck-cancel'}));await until(()=>cancel.messages.some((m:any)=>m.type==='QUICK_QUEUE_JOINED'));cancel.send(JSON.stringify({type:'LEAVE_QUICK_QUEUE'}));await until(()=>cancel.messages.some((m:any)=>m.type==='QUICK_QUEUE_LEFT'));cancel.close();
 const early=await api('c','/online-matches/quick-ai/ai-00000000-0000-4000-8000-000000000000');assert.equal(early.status,404);
 const c=socket('c');await until(()=>c.readyState===1);const started=Date.now();c.send(JSON.stringify({type:'JOIN_QUICK_QUEUE',deckId:'deck-c'}));await until(()=>c.messages.some((m:any)=>m.type==='QUICK_QUEUE_JOINED'));
 await pause(1000);c.send(JSON.stringify({type:'JOIN_QUICK_QUEUE',deckId:'deck-c'}));
 await pause(150);assert.equal(c.messages.some((m:any)=>m.type==='QUICK_AI_MATCH_FOUND'),false);
 await until(()=>c.messages.some((m:any)=>m.type==='QUICK_AI_MATCH_FOUND'),40000);const elapsed=Date.now()-started;assert.ok(elapsed>=30000&&elapsed<35000,'server deadline and duplicate-join timer preserved: '+elapsed);
 const id=c.messages.find((m:any)=>m.type==='QUICK_AI_MATCH_FOUND').matchId;assert.equal(c.messages.filter((m:any)=>m.type==='QUICK_AI_MATCH_FOUND').length,1);assert.equal(c.messages.some((m:any)=>m.type==='MATCH_FOUND'),false);
 const record=await api('c','/online-matches/quick-ai/'+id);assert.equal(record.status,200);assert.equal(record.body.opponentName,'기존 덱 상대');assert.equal(record.body.aiDeckId,'existing-ai');assert.equal(record.body.state.status,'IN_PROGRESS');assert.equal((await api('a','/online-matches/quick-ai/'+id)).status,404);
 c.send(JSON.stringify({type:'JOIN_QUICK_QUEUE',deckId:'deck-c'}));await until(()=>c.messages.filter((m:any)=>m.type==='QUICK_AI_MATCH_FOUND').length===2);assert.equal(c.messages.filter((m:any)=>m.type==='QUICK_AI_MATCH_FOUND')[1].matchId,id);
 assert.equal((await database.select().from(schema.aiQuestMatchesTable)).length,1);assert.equal(cancel.messages.some((m:any)=>m.type==='QUICK_AI_MATCH_FOUND'),false);assert.equal(a.messages.some((m:any)=>m.type==='QUICK_AI_MATCH_FOUND'),false);
 const events=[{type:'SURRENDER',playerId:record.body.state.players[0].id}];const completion=await api('c','/daily-quests/ai-match-progress','POST',{deckId:'deck-c',aiDeckId:'existing-ai',matchId:id,outcome:'LOSS',actions:events});assert.equal(completion.status,200);assert.equal(completion.body.completed,true);assert.equal(completion.body.reward.sourceType,'MATCH_AI_RESULT');const grant=(await database.select().from(schema.rewardGrantsTable)).find(g=>g.sourceId===id)!;assert.equal(grant.sourceType,'MATCH_AI_RESULT');assert.equal(grant.amount,17);const retry=await api('c','/daily-quests/ai-match-progress','POST',{deckId:'deck-c',aiDeckId:'existing-ai',matchId:id,outcome:'LOSS',actions:events});assert.equal(retry.status,200);assert.equal((await database.select().from(schema.rewardGrantsTable)).filter(g=>g.sourceId===id).length,1);
 assert.equal((await database.select().from(schema.onlineMatchesTable)).length,1,'fallback is not written as a PvP match');await api('c','/online-matches/quick-ai/'+id+'/release','POST');c.close();
});
test('native heartbeat expires an unresponsive socket without database queries', {timeout:75000,skip:process.env.KO_QUICK_BROWSER_MODE==='1'},async()=>{
 const a=socket('a'),stale=socket('stale',false);await until(()=>lastPresence(a)===true);const count=queries.length;
 await until(()=>stale.readyState===3,65000);await until(()=>lastPresence(a)===false);assert.equal(queries.length,count,'ping/pong and passive presence never hit Supabase');a.close();
});
