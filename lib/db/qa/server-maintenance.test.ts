import assert from 'node:assert/strict';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('maintenance defaults OFF and survives installer restart with ON/OFF and custom notice',async()=>{
 const pg=new PGlite();try{const migration=await readFile(new URL('../migrations/0033_server_maintenance.sql',import.meta.url),'utf8');await pg.exec(migration);
 const row=async()=> (await pg.query('SELECT * FROM ko_server_settings')).rows[0] as {maintenance_enabled:boolean;maintenance_message:string};
 assert.equal((await row()).maintenance_enabled,false);
 await pg.query("UPDATE ko_server_settings SET maintenance_enabled=true, maintenance_message=$1",['테스트 서버 점검']);await pg.exec(migration);assert.equal((await row()).maintenance_enabled,true);assert.equal((await row()).maintenance_message,'테스트 서버 점검');
 await pg.query('UPDATE ko_server_settings SET maintenance_enabled=false');await pg.exec(migration);assert.equal((await row()).maintenance_enabled,false);assert.equal((await pg.query('SELECT * FROM ko_server_settings')).rows.length,1);
 }finally{await pg.close();}
});
