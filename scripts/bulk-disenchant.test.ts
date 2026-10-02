import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const requireDb = createRequire(new URL('../lib/db/package.json', import.meta.url));
const { PGlite } = requireDb('@electric-sql/pglite');
const { drizzle } = requireDb('drizzle-orm/pglite');
const { getTableConfig } = requireDb('drizzle-orm/pg-core');
process.env.DATABASE_URL = 'postgres://unused:unused@localhost/unused';
const schema = await import('../lib/db/src/index');
const { default: router } = await import('../artifacts/api-server/src/routes/prism');
test('bulk endpoint preserves three, excludes tokens/drafts, credits actual balance, repeats safely and rolls back', async () => {
 const pg = new PGlite();
 try {
  for (const table of [schema.usersTable, schema.cardsTable, schema.userCardCollectionsTable, schema.prismEconomySettingsTable, schema.prismTransactionsTable]) {
   const cfg = getTableConfig(table);
   await pg.exec(`CREATE TABLE "${cfg.name}" (${cfg.columns.map((c: any) => `"${c.name}" ${c.enumValues ? 'text' : c.getSQLType()}`).join(',')})`);
  }
  const txDb = drizzle(pg);
  const original = schema.db.transaction;
  schema.db.transaction = txDb.transaction.bind(txDb);
  const handler = (router as any).stack.find((r: any) => r.route?.path === '/disenchant-extras').route.stack[0].handle;
  async function call() {
   let status = 200, result: any;
   await handler({ authUser: { id: 'user', email: 'qa@example.test', prismBalance: 1 } }, { status(n: number) { status=n; return this; }, json(value: any) { result=value; } });
   return {status, result};
  }
  await pg.exec(`INSERT INTO users (id,prism_balance) VALUES ('user',100);
   INSERT INTO cards (id,name,status,rarity,is_token,is_champion_token) VALUES
    ('a','A','PUBLISHED','NORMAL',false,false),('b','B','PUBLISHED','LEGENDARY',false,false),
    ('c','C','PUBLISHED','NORMAL',false,false),('d','D','DRAFT','NORMAL',false,false),('t','T','PUBLISHED','NORMAL',true,false);
   INSERT INTO user_card_collections (user_id,card_definition_id,quantity) VALUES ('user','a',8),('user','b',4),('user','c',2),('user','d',8),('user','t',8);
   INSERT INTO prism_economy_settings (rarity,craft_cost,disenchant_reward) VALUES ('NORMAL',100,10),('LEGENDARY',200,20);`);
  assert.deepEqual(await call(), {status:200,result:{dismantledQuantity:6,reward:70}});
  const rows = await pg.query('SELECT card_definition_id,quantity FROM user_card_collections ORDER BY card_definition_id');
  assert.deepEqual(rows.rows.map((r: any) => r.quantity),[3,3,2,8,8]);
  assert.equal((await pg.query('SELECT prism_balance FROM users')).rows[0].prism_balance,170);
  assert.deepEqual((await pg.query('SELECT balance_after FROM prism_transactions ORDER BY card_definition_id')).rows.map((r: any)=>r.balance_after),[150,170]);
  assert.deepEqual(await call(),{status:200,result:{dismantledQuantity:0,reward:0}});
  await pg.exec("UPDATE user_card_collections SET quantity=5 WHERE card_definition_id IN ('a','b'); DELETE FROM prism_economy_settings WHERE rarity='LEGENDARY';");
  assert.equal((await call()).status,503);
  assert.deepEqual((await pg.query("SELECT quantity FROM user_card_collections WHERE card_definition_id IN ('a','b') ORDER BY card_definition_id")).rows.map((r:any)=>r.quantity),[5,5]);
  assert.equal((await pg.query('SELECT prism_balance FROM users')).rows[0].prism_balance,170);
  schema.db.transaction = original;
 } finally { await pg.close(); }
});
