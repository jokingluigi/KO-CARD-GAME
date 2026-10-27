import { createRequire } from "node:module";
import { resolve } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import * as schema from "../../lib/db/src/schema/index.ts";
const dbRequire = createRequire(resolve("lib/db/package.json"));
const apiRequire = createRequire(resolve("artifacts/api-server/package.json"));
const { generateMigration, generateDrizzleJson } = dbRequire("drizzle-kit/api");
const ddl = await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson(schema),
);
await writeFile("scripts/sprite-preview/schema.sql", ddl.join("\n"));
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
