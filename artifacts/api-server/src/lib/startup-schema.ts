import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import towerStorage from "../../../../lib/db/migrations/0026_tower_mode.sql";
import towerUnlocks from "../../../../lib/db/migrations/0027_tower_unlocks.sql";
import championRules from "../../../../lib/db/migrations/0029_champion_rules.sql";
import aiDifficulty from "../../../../lib/db/migrations/0028_ai_deck_difficulty.sql";

/** Authorized additive installation, serialized across simultaneous server starts. */
export async function ensureTowerStorage(database = db): Promise<void> {
  await database.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ko-card-tower-schema-v1'))`);
    await tx.execute(sql`SET LOCAL lock_timeout = '15s'`);
    for (const migration of [towerStorage, towerUnlocks, aiDifficulty]) {
      // Migration 0026 has standalone transaction delimiters. One outer
      // transaction must own all three migrations and the advisory lock.
      const statements = migration.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gm, "").split(";");
      // These static DDL files contain no function bodies or quoted semicolons.
      // Execute individually for drivers that require one prepared statement.
      for (const statement of statements) {
        if (statement.trim()) await tx.execute(sql.raw(statement));
      }
    }
    // One DO block preserves existing catalog rows and applies the authorized rules once.
    await tx.execute(sql.raw(championRules));
  });
}
