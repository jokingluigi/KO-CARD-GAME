import { createRequire } from "node:module";
import { resolve } from "node:path";
import { writeFile, mkdir, readFile, rm } from "node:fs/promises";
import * as schema from "../../lib/db/src/schema/index.ts";
const dbRequire = createRequire(resolve("lib/db/package.json"));
const apiRequire = createRequire(resolve("artifacts/api-server/package.json"));
const { generateMigration, generateDrizzleJson } = dbRequire("drizzle-kit/api");
const ddl = await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson(schema),
);
await writeFile("scripts/sprite-preview/schema.sql", ddl.join("\n"));
// Build a public-data-only database template while the build worker has enough RAM.
// Runtime starts from this closed template instead of running memory-heavy initdb.
const template = resolve(
  "artifacts/api-server/dist-sprite-preview/database-template",
);
await rm(template, { recursive: true, force: true });
const { PGlite } = dbRequire("@electric-sql/pglite");
const { drizzle } = dbRequire("drizzle-orm/pglite");
const { getTableColumns } = dbRequire("drizzle-orm");
const pg = new PGlite(template, {
  postgresqlconf: [
    "shared_buffers=16MB",
    "work_mem=2MB",
    "maintenance_work_mem=16MB",
  ],
});
await pg.waitReady;
for (const sql of ddl) await pg.exec(sql);
for (const file of ["0053_cosmetics.sql", "0033_server_maintenance.sql"])
  await pg.exec(await readFile("lib/db/migrations/" + file, "utf8"));
const database = drizzle(pg, { schema });
for (const [kind, table] of [
  ["cards", schema.cardsTable],
  ["champions", schema.championsTable],
]) {
  const columns = getTableColumns(table);
  const rows = JSON.parse(
    await readFile(
      `artifacts/ko-game/src/game/qa/fixtures/${kind}-2026-10-12-all.json`,
      "utf8",
    ),
  );
  const values = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => key in columns)
        .map(([key, value]) => [
          key,
          columns[key].dataType === "date" && typeof value === "string"
            ? new Date(value)
            : value,
        ]),
    ),
  );
  await database.insert(table).values(values);
}
await pg.close();
const { build } = apiRequire("esbuild");
await mkdir("artifacts/api-server/dist-sprite-preview", { recursive: true });
await build({
  entryPoints: ["lib/db/sprite-preview-server.ts"],
  outfile: "artifacts/api-server/dist-sprite-preview/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  loader: { ".sql": "text" },
  external: ["sharp", "pino", "pino-http", "pg-native", "@google-cloud/*"],
  banner: {
    js: `import {createRequire as makeRequire} from 'node:module'; globalThis.require=makeRequire(import.meta.url);`,
  },
  logLevel: "info",
});
