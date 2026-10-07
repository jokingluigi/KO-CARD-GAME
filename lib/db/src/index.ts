import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  keepAlive: true,
});
// An idle connection can be closed by the host; discard it without crashing the API.
pool.on("error", (error) => console.error("[KO database] idle connection lost", (error as { code?: string }).code ?? "unknown"));
export const db = drizzle(pool, { schema });

export * from "./schema";
