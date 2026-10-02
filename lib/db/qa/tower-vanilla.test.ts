import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('vanilla migration inserts a draft HP30 champion and preserves existing rows and customized portrait',async()=>{
 const pg=new PGlite();try{
  await pg.exec(await readFile(new URL('../migrations/0002_champions.sql',import.meta.url),'utf8'));
  await pg.exec('ALTER TABLE champions ADD COLUMN is_starter_grant boolean NOT NULL DEFAULT false');
  await pg.exec("INSERT INTO champions(id,name,ability_name,ability_effects) VALUES('old','Old','Keep','{}')");
  const before=(await pg.query("SELECT * FROM champions WHERE id='old'")).rows;
  const migration=await readFile(new URL('../migrations/0035_tower_vanilla_champion.sql',import.meta.url),'utf8');await pg.exec(migration);
  const row=(await pg.query("SELECT * FROM champions WHERE id='champion-tower-vanilla'")).rows[0] as Record<string,unknown>;
  assert.equal(row.max_health,30);assert.equal(row.status,'DRAFT');assert.equal(row.has_quest,false);assert.deepEqual(row.ability_effects,{effects:[]});assert.equal(row.is_starter_grant,false);
  await pg.exec("UPDATE champions SET image_url='/custom.png' WHERE id='champion-tower-vanilla'");await pg.exec(migration);
  assert.equal((await pg.query("SELECT image_url FROM champions WHERE id='champion-tower-vanilla'")).rows[0].image_url,'/custom.png');
  assert.deepEqual((await pg.query("SELECT * FROM champions WHERE id='old'")).rows,before);
 }finally{await pg.close();}
});
