// Runs the real administration routes against an isolated PostgreSQL-compatible database.
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {generateDrizzleJson,generateMigration} from 'drizzle-kit/api';
import * as schema from '../src/schema';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
process.env.DATABASE_URL='postgresql://unused:unused@127.0.0.1:1/unused';
process.env.NODE_ENV='development';
const pg=new PGlite(),database=drizzle(pg,{schema});
for(const ddl of await generateMigration(generateDrizzleJson({}),generateDrizzleJson(schema)))await pg.exec(ddl);
await pg.exec(await readFile(new URL('../migrations/0033_server_maintenance.sql',import.meta.url),'utf8'));
const {db,pool}=await import('../src/index');
for(const method of ['select','insert','update','delete','transaction','execute'] as const)Object.assign(db,{[method]:database[method].bind(database)});
const {hashPassword}=await import('../../../artifacts/api-server/src/lib/auth');
await database.insert(schema.usersTable).values({id:'countdown-admin',email:'admin@countdown.invalid',nickname:'Countdown QA',passwordHash:await hashPassword('CountdownLocalQA123'),role:'ADMIN'});
const {default:app}=await import('../../../artifacts/api-server/src/app');
const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));
const address=server.address();assert.ok(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
let cookie='',id='';
async function request(path:string,method='GET',body?:unknown){
 const response=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
 const session=response.headers.get('set-cookie');if(session)cookie=session.split(';')[0];
 return {status:response.status,body:await response.json()};
}
after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await pg.close();await pool.end();});
const effect={trigger:'COUNTDOWN',action:'DAMAGE',target:{zone:'PLAYER',owner:'ENEMY',selection:'SELF',count:1},values:{amount:2}};
const input={name:'카운트다운 HTTP 검사',cardType:'WRESTLER',rarity:'NORMAL',cost:4,attack:5,health:6,text:'카운트다운(3): 상대 챔피언에게 피해를 2 줍니다.',keywords:['COUNTDOWN','ARMOR'],tags:[],isToken:false,isChampionToken:false,effectId:'STRUCTURED_EFFECTS_V1',effectConfig:{countdownTurns:3,armor:2,effects:[effect]}};

test('HTTP countdown login, creation and database save keep N and all base stats',async()=>{
 assert.equal((await request('/auth/login','POST',{email:'admin@countdown.invalid',password:'CountdownLocalQA123'})).status,200);
 const created=await request('/admin/cards','POST',input);assert.equal(created.status,201);id=created.body.card.id;
 assert.equal(created.body.card.effectConfig.countdownTurns,3);assert.deepEqual([created.body.card.cost,created.body.card.attack,created.body.card.health],[4,5,6]);
 const stored=(await pg.query<Record<string,any>>('SELECT * FROM cards WHERE id=$1',[id])).rows[0]!;
 assert.equal(stored.effect_config.countdownTurns,3);assert.ok(stored.keywords.includes('COUNTDOWN'));
});

test('HTTP countdown update/relogin/reload changes only configured clock and effect text',async()=>{
 const updated=await request(`/admin/cards/${id}`,'PATCH',{...input,text:input.text.replace('(3)','(2)'),effectConfig:{...input.effectConfig,countdownTurns:2}});
 assert.equal(updated.status,200);assert.equal(updated.body.card.effectConfig.countdownTurns,2);
 assert.deepEqual([updated.body.card.cost,updated.body.card.attack,updated.body.card.health],[4,5,6]);
 cookie='';assert.equal((await request('/auth/login','POST',{email:'admin@countdown.invalid',password:'CountdownLocalQA123'})).status,200);
 const loaded=await request('/admin/cards');assert.equal(loaded.body.cards.find((c:any)=>c.id===id).effectConfig.countdownTurns,2);
});

for(const n of [0,-1,1.5,1000,'3'])test(`HTTP countdown rejects invalid number ${n} without overwriting saved clock`,async()=>{
 const result=await request(`/admin/cards/${id}`,'PATCH',{...input,effectConfig:{...input.effectConfig,countdownTurns:n}});assert.equal(result.status,400);
 assert.equal((await pg.query<Record<string,any>>('SELECT effect_config FROM cards WHERE id=$1',[id])).rows[0]!.effect_config.countdownTurns,2);
});

test('HTTP countdown rejects techniques and an unbound trigger',async()=>{
 assert.equal((await request('/admin/cards','POST',{...input,cardType:'TECHNIQUE'})).status,400);
 assert.equal((await request('/admin/cards','POST',{...input,keywords:[]})).status,400);
});

test('HTTP analyzer and registry expose COUNTDOWN and preserve the number',async()=>{
 const result=await request('/admin/effects/analyze','POST',{text:input.text});assert.equal(result.status,200);
 assert.equal(result.body.countdownTurns,3);assert.ok(result.body.keywords.includes('COUNTDOWN'));assert.equal(result.body.effects[0].trigger,'COUNTDOWN');
});

test('HTTP effect generator preserves countdown number and returns an applicable tested draft',async()=>{
 const result=await request('/admin/effects/generate','POST',{text:input.text,sourceType:'CARD',sourceId:id,cardType:'WRESTLER'});
 assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.status,'READY');
 assert.equal(result.body.effectConfig.countdownTurns,3);assert.ok(result.body.keywords.includes('COUNTDOWN'));
 assert.equal(result.body.semanticPlan.ambiguities.length,0);assert.equal(result.body.dryRun[0].status,'EXECUTED');
});

test('HTTP publish/public catalog keep configurable clock and shared runtime fires the saved effect',async()=>{
 const published=await request(`/admin/cards/${id}/status`,'POST',{status:'PUBLISHED'});assert.equal(published.status,200);
 const catalog=await request('/cards');assert.equal(catalog.status,200);
 const record=catalog.body.cards.find((c:any)=>c.id===id);assert.equal(record.effectConfig.countdownTurns,2);
 const {cardRecordToDefinition,createInitialGameState,generateCardInstance,enterField,endTurn}=await import('../../game-engine/src');
 const card=cardRecordToDefinition(record);let state=createInitialGameState(undefined,[card]);
 state.status='IN_PROGRESS';state.turn=1;state.activePlayerId='player-1';
 state=enterField(state,'player-1',generateCardInstance(card,{instanceId:'saved-timer'}),0);const health=state.players[1].health;
 for(let step=0;step<4;step++){const next=endTurn(JSON.parse(JSON.stringify(state)),state.activePlayerId!);assert.ok(next.success);state=next.state;}
 assert.equal(state.players[1].health,health-2);assert.equal(state.players[0].board[0]!.countdownResolved,true);
});
