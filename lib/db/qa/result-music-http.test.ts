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
test('admin session and media mutations enforce real server account roles',async()=>{
 assert.equal((await guest('/admin/session')).body.authenticated,false);
 assert.equal((await guest('/admin/game-media/win2','PATCH',{gameEnabled:true})).status,401);
 assert.equal((await user('/auth/login','POST',{email:'user@music.invalid',password})).status,200);
 assert.equal((await user('/admin/session')).body.authenticated,false);
 assert.equal((await user('/admin/game-media/win2','PATCH',{gameEnabled:true})).status,403);
 assert.equal((await admin('/auth/login','POST',{email:'admin@music.invalid',password})).status,200);
 const session=await admin('/admin/session');assert.equal(session.body.user.role,'ADMIN');
});
test('result music activation and volume persist, replace only the same outcome, and publish only enabled assets',async()=>{
 let r=await admin('/admin/game-media/win2','PATCH',{gameEnabled:true,volume:37});assert.equal(r.status,200);assert.equal(r.body.media.volume,37);
 const media=await database.select().from(schema.gameMediaTable);assert.equal(media.find(m=>m.id==='win1')!.gameEnabled,false);assert.equal(media.find(m=>m.id==='loss1')!.gameEnabled,true);assert.equal(media.find(m=>m.id==='match')!.gameEnabled,true);
 r=await guest('/game-media');assert.equal(r.status,200);assert.deepEqual(r.body.media.map((m:any)=>m.id).sort(),['loss1','match','win2']);assert.ok(r.body.media.every((m:any)=>!('assetId' in m)));
 assert.equal((await admin('/admin/game-media/loss2','PATCH',{gameEnabled:true,volume:55})).status,200);
 assert.equal((await admin('/admin/game-media/win2','PATCH',{volume:101})).status,400);
 assert.equal((await admin('/admin/game-media')).body.media.find((m:any)=>m.id==='win2').volume,37);
});
test('concurrent result-track selection leaves one active track; disable allows silence',async()=>{
 const results=await Promise.all([admin('/admin/game-media/win1','PATCH',{gameEnabled:true}),admin('/admin/game-media/win2','PATCH',{gameEnabled:true})]);assert.ok(results.every(r=>r.status===200));
 let rows=await database.select().from(schema.gameMediaTable).where(eq(schema.gameMediaTable.mediaType,'VICTORY_BGM'));assert.equal(rows.filter(m=>m.gameEnabled).length,1);
 const active=rows.find(m=>m.gameEnabled)!;assert.equal((await admin('/admin/game-media/'+active.id,'PATCH',{gameEnabled:false})).status,200);
 rows=await database.select().from(schema.gameMediaTable).where(eq(schema.gameMediaTable.mediaType,'VICTORY_BGM'));assert.equal(rows.filter(m=>m.gameEnabled).length,0);
 assert.equal((await guest('/game-media')).body.media.filter((m:any)=>m.mediaType==='VICTORY_BGM').length,0);
});
