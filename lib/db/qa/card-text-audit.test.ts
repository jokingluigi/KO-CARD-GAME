import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { isEffectScript } from '../../effect-registry/src/index';

test('reviewed catalog repairs preserve stats/text, back up originals and are idempotent',async()=>{
 const fixture=JSON.parse(readFileSync(new URL('../../../artifacts/ko-game/src/game/qa/fixtures/card-audit-2026-10-05.json',import.meta.url),'utf8'));
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE cards(id text PRIMARY KEY,cost integer,attack integer,health integer,text text,effect_id text,effect_config jsonb,version integer,updated_at timestamptz);
   CREATE TABLE champions(id text PRIMARY KEY,ability_text text,ability_cost integer,max_health integer,ability_effects jsonb,version integer,updated_at timestamptz);`);
  const rows=fixture.cards.filter((c:any)=>['오젠','발단','아르카나 조커','생명의 교환'].includes(c.name));
  for(const c of rows)await db.query('INSERT INTO cards VALUES($1,$2,$3,$4,$5,$6,$7,10,now())',[c.id,c.cost,c.attack,c.health,c.text,c.effectId,c.effectConfig]);
  const c=fixture.champions[0];
  await db.query('INSERT INTO champions VALUES($1,$2,$3,$4,$5,10,now())',[c.id,c.abilityText,c.abilityCost,c.maxHealth,c.abilityEffects]);
  const before=(await db.query<any>('SELECT * FROM cards ORDER BY id')).rows;
  const championBefore=(await db.query<any>('SELECT * FROM champions')).rows[0];
  const sql=readFileSync(new URL('../migrations/0044_card_text_audit.sql',import.meta.url),'utf8');
  await db.exec(sql);const once=(await db.query<any>('SELECT * FROM cards ORDER BY id')).rows;await db.exec(sql);
  assert.deepEqual((await db.query('SELECT * FROM cards ORDER BY id')).rows,once);
  for(let i=0;i<before.length;i++){
   assert.equal(once[i].version,11);
   assert.deepEqual({...once[i],effect_id:before[i].effect_id,effect_config:before[i].effect_config,version:before[i].version,updated_at:before[i].updated_at},before[i]);
  }
  const life=once.find(r=>r.id==='epic-spell-life-exchange');assert.ok(life.effect_config.scripts.every(isEffectScript));
  const championAfter=(await db.query<any>('SELECT * FROM champions')).rows[0];
  assert.deepEqual({...championAfter,ability_effects:championBefore.ability_effects,version:championBefore.version,updated_at:championBefore.updated_at},championBefore);
  assert.equal(championAfter.version,11);assert.equal(championAfter.ability_effects.effects[0].values.generatedModifiers.cost,-1);
  assert.equal((await db.query('SELECT * FROM ko_catalog_patch_backups')).rows.length,5);
  // A later administrator edit must survive a subsequent startup.
  await db.query("UPDATE cards SET effect_config='{}',text='changed by administrator' WHERE id=$1",[rows[0].id]);
  await db.exec(sql);assert.equal((await db.query<any>('SELECT text FROM cards WHERE id=$1',[rows[0].id])).rows[0].text,'changed by administrator');
 }finally{await db.close();}
});
