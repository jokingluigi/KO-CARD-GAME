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
await database.insert(schema.usersTable).values({id:'random-scope-user',email:'scope@qa.invalid',nickname:'Scope QA',passwordHash:await hashPassword('RandomScopeQA123'),role:'USER'});
const cases=[{id:'public',status:'PUBLISHED'},{id:'draft',status:'DRAFT'},{id:'disabled',status:'DISABLED'},
  {id:'token',status:'PUBLISHED',isToken:true},{id:'champion-token',status:'DRAFT',isToken:true,isChampionToken:true}] as const;
await database.insert(schema.cardsTable).values(cases.map(item=>({name:item.id,cardType:'WRESTLER' as const,rarity:'NORMAL' as const,cost:2,attack:3,health:4,text:'',keywords:[],tags:[],effectId:null,effectConfig:{},...item})));
const {default:app}=await import('../../../artifacts/api-server/src/app');
const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.on('listening',resolve));
const address=server.address();assert.ok(address&&typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
let cookie='';
async function request(path:string,method='GET',body?:unknown){
  const response=await fetch(origin+'/api'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
  const session=response.headers.get('set-cookie');if(session)cookie=session.split(';')[0];
  return {status:response.status,body:await response.json()};
}
after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await pg.close();await pool.end();});

test('anonymous full catalog remains authenticated and public browsing does not expose draft/disabled cards',async()=>{
  assert.equal((await request('/minion-a/cards')).status,401);
  const publicCards=await request('/cards');assert.equal(publicCards.status,200);
  assert.deepEqual(publicCards.body.cards.map((c:any)=>c.id).sort(),['public','token']);
});

test('normal authenticated users receive every effect category, independently of ownership',async()=>{
  assert.equal((await request('/auth/login','POST',{email:'scope@qa.invalid',password:'RandomScopeQA123'})).status,200);
  const result=await request('/minion-a/cards');assert.equal(result.status,200);
  assert.deepEqual(result.body.definitions.filter((c:any)=>c.id!=='ko-fallback-zombie-token').map((c:any)=>c.id).sort(),cases.map(c=>c.id).sort());
  assert.deepEqual((await request('/cards')).body.cards.map((c:any)=>c.id).sort(),['public','token']);
});

for(const scope of ['STANDARD','FULL'] as const)test(`real HTTP catalog and ordinary shared-engine cards execute ${scope} generation`,async()=>{
  const result=await request('/minion-a/cards');assert.equal(result.status,200);
  const {createInitialGameState,generateCardInstance,enterField}=await import('../../game-engine/src');
  const definitions=result.body.definitions;
  const visible=definitions.filter((d:any)=>d.id==='public');
  const state=createInitialGameState(undefined,visible,undefined,undefined,{randomSeed:12,minionACardPool:definitions});
  state.players[0].hand=[];
  const source=generateCardInstance({...visible[0],abilities:[{trigger:'ENTER_FIELD',effects:[{type:'STRUCTURED',action:'GENERATE',target:{zone:'HAND',owner:'SELF',selection:'RANDOM',count:20,randomScope:scope}}]}]},{instanceId:'ordinary-card'});
  const next=enterField(JSON.parse(JSON.stringify(state)),'player-1',source,0);
  assert.deepEqual(next.players[0].hand.map(c=>c.definitionId).sort(),(scope==='FULL'?definitions.map((d:any)=>d.id):['public']).sort());
  assert.ok(state.players.every(p=>p.deck.every(c=>c.definitionId==='public')));
  for(const card of next.players[0].hand.filter(c=>c.definitionId!=='ko-fallback-zombie-token'))assert.deepEqual([card.baseCost,card.baseAttack,card.baseHealth],[2,3,4]);
});
