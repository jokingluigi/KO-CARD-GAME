import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { LUNA_ID, LUNA_OLD_TEXT, LUNA_RULES_TEXT } from '../../../artifacts/ko-game/src/game/cards/luna';
import type { PublishedCardRecord } from '../../../artifacts/ko-game/src/game/cards/published-cards';
const sql=readFileSync(new URL('../migrations/0047_luna_self_silence.sql',import.meta.url),'utf8');
const cards:PublishedCardRecord[]=JSON.parse(readFileSync(new URL('../../../artifacts/ko-game/src/game/qa/fixtures/card-audit-2026-10-05.json',import.meta.url),'utf8')).cards;
const card=cards.find(c=>c.id===LUNA_ID)!;

test('Luna migration replaces self seal with silence once, backs up the original and preserves all stats/other effects',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE cards(id text PRIMARY KEY,cost integer,attack integer,health integer,text text,effect_id text,effect_config jsonb,version integer,updated_at timestamptz);
      CREATE TABLE ko_catalog_patch_backups(patch_id text,entity_type text,entity_id text,original_record jsonb,PRIMARY KEY(patch_id,entity_type,entity_id));`);
    await db.query('INSERT INTO cards VALUES($1,$2,$3,$4,$5,$6,$7,16,now())',[card.id,card.cost,card.attack,card.health,LUNA_OLD_TEXT,card.effectId,card.effectConfig]);
    const before=(await db.query<Record<string,any>>('SELECT * FROM cards')).rows[0]!;
    await db.exec(sql);const after=(await db.query<Record<string,any>>('SELECT * FROM cards')).rows[0]!;
    assert.equal(after.text,LUNA_RULES_TEXT);assert.equal(after.version,17);
    const expectedConfig=structuredClone(before.effect_config);expectedConfig.effects[1].action='SILENCE';
    assert.deepEqual(after.effect_config,expectedConfig);
    assert.deepEqual({...after,text:before.text,effect_config:before.effect_config,version:before.version,updated_at:before.updated_at},before);
    await db.exec(sql);assert.deepEqual((await db.query('SELECT * FROM cards')).rows[0],after);
    const backup=(await db.query<Record<string,any>>('SELECT * FROM ko_catalog_patch_backups')).rows;
    assert.equal(backup.length,1);assert.equal(backup[0]!.original_record.text,LUNA_OLD_TEXT);
    assert.equal(backup[0]!.original_record.effect_config.effects[1].action,'DISABLE_ABILITY');
    await db.query('UPDATE cards SET text=$1,effect_config=$2 WHERE id=$3',['관리자 새 설명',card.effectConfig,card.id]);
    const custom=(await db.query('SELECT * FROM cards')).rows[0];await db.exec(sql);
    assert.deepEqual((await db.query('SELECT * FROM cards')).rows[0],custom);
    await db.query('UPDATE cards SET text=$1,effect_config=$2 WHERE id=$3',[LUNA_OLD_TEXT,{effects:[]},card.id]);
    const unsupported=(await db.query('SELECT * FROM cards')).rows[0];await db.exec(sql);
    assert.deepEqual((await db.query('SELECT * FROM cards')).rows[0],unsupported);
  }finally{await db.close();}
});
