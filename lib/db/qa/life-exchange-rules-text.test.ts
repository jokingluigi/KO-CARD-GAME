import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { lifeExchangeConfig, LIFE_EXCHANGE_OLD_TEXT, LIFE_EXCHANGE_RULES_TEXT } from '../../../artifacts/ko-game/src/game/cards/life-exchange';
const sql = readFileSync(new URL('../migrations/0046_life_exchange_rules_text.sql', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('../../../artifacts/ko-game/src/game/qa/fixtures/card-audit-2026-10-05.json', import.meta.url), 'utf8'));
const card = fixture.cards.find((card: any) => card.id === 'epic-spell-life-exchange');

test('Life Exchange description repair preserves stats/effects, saves the original and applies once', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE cards(id text PRIMARY KEY,cost integer,attack integer,health integer,text text,effect_id text,effect_config jsonb,version integer,updated_at timestamptz);
      CREATE TABLE ko_catalog_patch_backups(patch_id text,entity_type text,entity_id text,original_record jsonb,PRIMARY KEY(patch_id,entity_type,entity_id));`);
    await db.query('INSERT INTO cards VALUES($1,$2,$3,$4,$5,$6,$7,20,now())', [card.id,card.cost,card.attack,card.health,LIFE_EXCHANGE_OLD_TEXT,card.effectId,lifeExchangeConfig(card.effectConfig)]);
    const before = (await db.query<any>('SELECT * FROM cards')).rows[0];
    await db.exec(sql);
    const once = (await db.query<any>('SELECT * FROM cards')).rows[0];
    await db.exec(sql);
    assert.deepEqual((await db.query('SELECT * FROM cards')).rows[0], once);
    assert.equal(once.text, LIFE_EXCHANGE_RULES_TEXT);
    assert.equal(once.version, 21);
    assert.deepEqual({...once,text:before.text,version:before.version,updated_at:before.updated_at}, before);
    const backups = (await db.query<any>('SELECT * FROM ko_catalog_patch_backups')).rows;
    assert.equal(backups.length, 1);
    assert.equal(backups[0].original_record.text, LIFE_EXCHANGE_OLD_TEXT);
    await db.query("UPDATE cards SET text='관리자가 새로 작성한 설명',effect_config='{}' WHERE id=$1", [card.id]);
    await db.exec(sql);
    assert.equal((await db.query<any>('SELECT * FROM cards')).rows[0].text,'관리자가 새로 작성한 설명');
    for (const config of [{}, {scripts:null}, {scripts:[{steps:null}]}, card.effectConfig]) {
      await db.query('UPDATE cards SET text=$1,effect_config=$2 WHERE id=$3', [LIFE_EXCHANGE_OLD_TEXT,config,card.id]);
      await db.exec(sql);
      const unchanged = (await db.query<any>('SELECT * FROM cards')).rows[0];
      assert.equal(unchanged.text, LIFE_EXCHANGE_OLD_TEXT);
      assert.equal(unchanged.version, 21);
    }
  } finally { await db.close(); }
});
