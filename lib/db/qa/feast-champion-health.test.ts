import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('Feast effect migration changes only requested text/effect, preserves specs/status and runs once',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE TABLE cards(id text primary key,text text,effect_config jsonb,cost integer,attack integer,health integer,status text,version integer,updated_at timestamptz);
 INSERT INTO cards VALUES('epic-spell-feast','모든 아군 선수에게 HP +3을 부여합니다.','{}',4,0,0,'PUBLISHED',3,now()),('other','원본','{}',5,2,7,'DRAFT',9,now());`);
 const sql=await readFile(new URL('../migrations/0041_feast_champion_health.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 const {rows}=await db.query<any>('SELECT * FROM cards ORDER BY id');const feast=rows.find(r=>r.id==='epic-spell-feast');assert.deepEqual([feast.cost,feast.attack,feast.health,feast.status,feast.version],[4,0,0,'PUBLISHED',4]);assert.ok(feast.text.includes('챔피언'));assert.equal(feast.effect_config.scripts[0].steps[1].effect.target.zone,'PLAYER');assert.equal(rows.find(r=>r.id==='other').version,9);
 }finally{await db.close();}
});
