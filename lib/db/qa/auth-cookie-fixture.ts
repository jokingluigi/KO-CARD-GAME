/** Loopback-only login/session fixture; production database is never used. */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as schema from "../src/schema";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.NODE_ENV = "development";
const pg = new PGlite(),
  database = drizzle(pg, { schema });
for (const ddl of await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson(schema),
))
  await pg.exec(ddl);
await pg.exec(
  await readFile(
    new URL("../migrations/0033_server_maintenance.sql", import.meta.url),
    "utf8",
  ),
);
const { db } = await import("../src");
for (const method of [
  "select",
  "insert",
  "update",
  "delete",
  "transaction",
  "execute",
] as const)
  Object.assign(db, { [method]: database[method].bind(database) });
const { hashPassword } =
  await import("../../../artifacts/api-server/src/lib/auth");
await database.insert(schema.usersTable).values({
  id: "auth-cookie-qa",
  email: "cookie@auth.invalid",
  nickname: "COOKIE_QA",
  passwordHash: await hashPassword("Local-cookie-only-123!"),
  role: "ADMIN",
  shopCurrencyStarterGrantedAt: new Date(),
});
const { default: app } = await import("../../../artifacts/api-server/src/app");
const require = createRequire(
  new URL("../../../artifacts/api-server/package.json", import.meta.url),
);
const host = require("express")();
host.use(app);
const server = host.listen(
  Number(process.env.KO_AUTH_COOKIE_PORT ?? 17994),
  "127.0.0.1",
);
await new Promise<void>((r) => server.once("listening", r));
console.log("AUTH_COOKIE_READY http://127.0.0.1:" + server.address().port);
for (const sig of ["SIGTERM", "SIGINT"])
  process.on(sig, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
