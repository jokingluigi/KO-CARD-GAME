/** Disposable in-memory PostgreSQL-compatible DB only. No production connection. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
await import('./checkpoints/20261006/qa-loader.mjs');
const {PGlite}=await import('../../lib/db/node_modules/@electric-sql/pglite/dist/index.js');
const {drizzle}=await import('../../lib/db/node_modules/drizzle-orm/pglite/index.js');
const {generateDrizzleJson,generateMigration}=await import('../../lib/db/node_modules/drizzle-kit/api.mjs');
const schema=await import('../../lib/db/src/schema/index.ts');
export async function startTutorialFixture(){
 process.env.DATABASE_URL='postgresql://unused:unused@127.0.0.1:1/unused';
 const pg=new PGlite(),database=drizzle(pg,{schema});
 for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await pg.exec(ddl);
 await pg.exec(await readFile('lib/db/migrations/0033_server_maintenance.sql','utf8'));
 const {db}=await import('../../lib/db/src/index.ts');
 for(const method of ['select','insert','update','delete','transaction','execute'])Object.assign(db,{[method]:database[method].bind(database)});
 const {hashPassword}=await import('../../artifacts/api-server/src/lib/auth.ts');
 await database.insert(schema.usersTable).values({id:'tutorial-user',email:'tutorial@example.invalid',nickname:'실습 검증',passwordHash:await hashPassword('Isolated-Tutorial-QA-123'),role:'ADMIN',currencyBalance:0,shopCurrencyStarterGrantedAt:new Date()});
 await database.insert(schema.cardsTable).values({id:'reward-unit',name:'격리 보상 선수',cardType:'WRESTLER',rarity:'NORMAL',status:'PUBLISHED',cost:1,attack:1,health:2,text:''});
 await database.insert(schema.championsTable).values({id:'reward-champion',name:'격리 보상 챔피언',status:'PUBLISHED',abilityName:'격리 능력',abilityEffects:{effects:[]}});
 await database.insert(schema.packDefinitionsTable).values([
  {id:'normal-pack',name:'노멀팩',normalRate:100,legendaryRate:0,championRate:0,status:'PUBLISHED',normalCardPool:['reward-unit']},
  {id:'champion-pack',name:'확정 챔피언팩',normalRate:0,legendaryRate:0,championRate:100,status:'PUBLISHED',championPool:['reward-champion']},
 ]);
 const {default:app}=await import('../../artifacts/api-server/src/app.ts');
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));const addr=server.address();assert.ok(addr&&typeof addr==='object');const origin=`http://127.0.0.1:${addr.port}`;
 const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'tutorial@example.invalid',password:'Isolated-Tutorial-QA-123'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 return {origin,cookie,db:database,schema,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pg.close();}};
}
export async function lessonProof(lessonId,gameId='tutorial:qa:'+lessonId){
 const {rewardTutorialCatalog:catalog}=await import('../../artifacts/api-server/src/lib/tutorial-catalog.ts');
 const {createTutorialLesson,tutorialGoal}=await import('../../lib/game-engine/src/tutorial.ts');
 const {executeAction}=await import('../../lib/game-engine/src/index.ts');
 let s=createTutorialLesson(catalog,lessonId,gameId);const actions=[];let cancelled=false;
 const act=a=>{actions.push(a);const r=executeAction(s,a);assert.ok(r.success,r.message);s=r.state;if(a.type==='END_TURN'){const r=executeAction(s,{type:'END_TURN',playerId:'player-2'});assert.ok(r.success);s=r.state;}};
 const own='player-1',enemy='player-2';
 if(lessonId==='basics'){
  act({type:'MULLIGAN',playerId:own,cardInstanceIds:[]});
  const id=s.players[0].hand[0].instanceId;act({type:'PLAY_WRESTLER',playerId:own,cardInstanceId:id,boardSlot:0});act({type:'END_TURN',playerId:own});act({type:'ATTACK',playerId:own,attackerInstanceId:id,target:{type:'PLAYER',playerId:enemy}});
 }else if(lessonId==='combat'){
  for(let i=0;i<2;i++){act({type:'ATTACK',playerId:own,attackerInstanceId:s.players[0].board[0].instanceId,target:{type:'WRESTLER',playerId:enemy,cardInstanceId:s.players[1].board[0].instanceId}});if(i===0)act({type:'END_TURN',playerId:own});}
 }else if(lessonId==='rush'){
  const id=s.players[0].hand[0].instanceId;act({type:'PLAY_WRESTLER',playerId:own,cardInstanceId:id,boardSlot:0});act({type:'ATTACK',playerId:own,attackerInstanceId:id,target:{type:'PLAYER',playerId:enemy}});
 }else if(lessonId==='spell'){
  const begin={type:'BEGIN_TARGETED_ACTION',playerId:own,action:{type:'PLAY_TECHNIQUE',cardInstanceId:s.players[0].hand[0].instanceId}};
  act(begin);act({type:'CANCEL_EFFECT_TARGET',playerId:own});cancelled=true;act(begin);act({type:'CONFIRM_PRECOMMIT_TARGET',playerId:own,targetId:s.players[1].board[0].instanceId});
 }else if(lessonId==='active')act({type:'USE_ACTIVE',playerId:own,cardInstanceId:s.players[0].board[0].instanceId});
 else act({type:'USE_CHAMPION_ABILITY',playerId:own});
 assert.ok(tutorialGoal(lessonId,s,catalog,cancelled).complete);
 return {lessonId,gameId,actions};
}
