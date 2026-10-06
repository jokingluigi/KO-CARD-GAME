import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Ozen token target repair changes only random scope and applies once',async()=>{
 const fixture=JSON.parse(readFileSync(new URL('../../../artifacts/ko-game/src/game/qa/fixtures/quick-match-reported-cards.json',import.meta.url),'utf8'));
 const c=fixture.cards.find((c:any)=>c.name==='오젠');const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE cards(id text PRIMARY KEY,cost integer,attack integer,health integer,text text,effect_id text,effect_config jsonb,version integer,updated_at timestamptz);
   CREATE TABLE ko_catalog_patch_backups(patch_id text,entity_type text,entity_id text,original_record jsonb,PRIMARY KEY(patch_id,entity_type,entity_id));`);
  await db.query('INSERT INTO cards VALUES($1,$2,$3,$4,$5,$6,$7,16,now())',[c.id,c.cost,c.attack,c.health,c.text,c.effectId,c.effectConfig]);
  const before=(await db.query<any>('SELECT * FROM cards')).rows[0];
  const sql=readFileSync(new URL('../migrations/0045_ozen_ordinary_token_targets.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  const after=(await db.query<any>('SELECT * FROM cards')).rows[0];assert.equal(after.version,17);
  assert.equal(after.effect_config.effects[0].target.randomScope,'FULL');
  const expected=structuredClone(before.effect_config);expected.effects[0].target.randomScope='FULL';assert.deepEqual(after.effect_config,expected);
  assert.deepEqual({...after,effect_config:before.effect_config,version:before.version,updated_at:before.updated_at},before);
  assert.equal((await db.query('SELECT * FROM ko_catalog_patch_backups')).rows.length,1);
 }finally{await db.close();}
});
