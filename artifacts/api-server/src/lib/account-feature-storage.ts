import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
/** Read-only capability check: deployments never create or alter production tables. */
export async function accountFeatureStorage() {
  try {
    const result = await db.execute(
      sql`SELECT to_regclass('public.player_journals') IS NOT NULL AS journal, to_regclass('public.password_reset_tokens') IS NOT NULL AS recovery`,
    );
    return {
      journal: result.rows[0]?.journal === true,
      recovery: result.rows[0]?.recovery === true,
    };
  } catch {
    return { journal: false, recovery: false };
  }
}
