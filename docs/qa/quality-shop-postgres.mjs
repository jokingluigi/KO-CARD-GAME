/** Ephemeral local PostgreSQL only. Never accepts a production connection string. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
await import("./checkpoints/20261006/qa-loader.mjs");
const url =
    process.env.KO_QUALITY_TEST_DATABASE_URL ??
    "postgresql://quality_runner@127.0.0.1:56437/ko_quality_test",
  target = new URL(url);
assert.equal(target.hostname, "127.0.0.1");
assert.equal(target.pathname, "/ko_quality_test");
assert.equal(target.username, "quality_runner");
process.env.DATABASE_URL = url;
process.env.NODE_ENV = "test";
const {
  db,
  pool,
  usersTable,
  packDefinitionsTable,
  shopListingsTable,
  currencyTransactionsTable,
  userPackInventoryTable,
} = await import("../../lib/db/src/index.ts");
const { generateDrizzleJson, generateMigration } =
  await import("../../lib/db/node_modules/drizzle-kit/api.mjs");
const schema = await import("../../lib/db/src/schema/index.ts");
assert.equal(
  Number(
    (
      await pool.query(
        "SELECT count(*) AS count FROM information_schema.tables WHERE table_schema='public'",
      )
    ).rows[0].count,
  ),
  0,
  "QA database must be empty",
);
for (const sql of await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson(schema),
))
  await pool.query(sql);
await pool.query(
  await readFile("lib/db/migrations/0033_server_maintenance.sql", "utf8"),
);
const { hashPassword } =
  await import("../../artifacts/api-server/src/lib/auth.ts");
await db
  .insert(usersTable)
  .values({
    id: "quality-shop-user",
    email: "quality-shop@example.invalid",
    nickname: "Quality QA",
    passwordHash: await hashPassword("Isolated-Quality-Only-123"),
    role: "USER",
    currencyBalance: 5000,
    shopCurrencyStarterGrantedAt: new Date(),
  });
await db
  .insert(packDefinitionsTable)
  .values({ id: "quality-pack", name: "Isolated pack", status: "PUBLISHED" });
await db
  .insert(shopListingsTable)
  .values({
    id: "quality-listing",
    packDefinitionId: "quality-pack",
    quantity: 2,
    price: 100,
  });
const { default: app } = await import("../../artifacts/api-server/src/app.ts");
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
try {
  const login = await fetch(origin + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "quality-shop@example.invalid",
      password: "Isolated-Quality-Only-123",
    }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const buy = (key, quantity = 1) =>
    fetch(origin + "/api/shop/quality-listing/purchase", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        quantity,
        idempotencyKey: key,
        accountId: "quality-shop-user",
      }),
    });
  const same = await Promise.all(
    Array.from({ length: 12 }, () => buy("same-request-concurrent-0001")),
  );
  assert.ok(same.every((r) => r.status === 200));
  const receipts = await Promise.all(same.map((r) => r.json()));
  for (const receipt of receipts) assert.deepEqual(receipt, receipts[0]);
  let transactions = await db.select().from(currencyTransactionsTable);
  assert.equal(transactions.length, 1);
  assert.equal((await db.select().from(usersTable))[0].currencyBalance, 4900);
  assert.equal((await db.select().from(userPackInventoryTable))[0].quantity, 2);
  const distinct = await Promise.all(
    Array.from({ length: 8 }, (_, i) => buy("distinct-request-0000" + i)),
  );
  assert.ok(distinct.every((r) => r.status === 200));
  transactions = await db.select().from(currencyTransactionsTable);
  assert.equal(transactions.length, 9);
  assert.equal((await db.select().from(usersTable))[0].currencyBalance, 4100);
  assert.equal(
    (await db.select().from(userPackInventoryTable))[0].quantity,
    18,
  );
  const conflicting = await buy("same-request-concurrent-0001", 2);
  assert.equal(conflicting.status, 409);
  assert.equal((await db.select().from(currencyTransactionsTable)).length, 9);
  const results = {
    database: "isolated local PostgreSQL 17",
    concurrentSameKeyRequests: 12,
    sameKeyDebits: 1,
    sameKeyGrants: 1,
    distinctRequests: 8,
    finalBalance: 4100,
    finalPacks: 18,
    quantityConflictStatus: 409,
  };
  await mkdir("qa-results/quality-shop-postgres", { recursive: true });
  await writeFile(
    "qa-results/quality-shop-postgres/results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
