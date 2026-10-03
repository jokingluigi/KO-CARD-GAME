import draftStorage from '../../../../lib/db/migrations/0037_admin_draft.sql';
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import epicPackConfiguration from "../../../../lib/db/migrations/0036_epic_pack_configuration.sql";
import towerStorage from "../../../../lib/db/migrations/0026_tower_mode.sql";
import towerUnlocks from "../../../../lib/db/migrations/0027_tower_unlocks.sql";
import piStarSevenQuest from "../../../../lib/db/migrations/0030_pi-star-seven-quest.sql";
import towerVanilla from "../../../../lib/db/migrations/0035_tower_vanilla_champion.sql";
import minionA from "../../../../lib/db/migrations/0034_minion_a.sql";
import maintenanceSchema from "../../../../lib/db/migrations/0033_server_maintenance.sql";
import ozenGilded from "../../../../lib/db/migrations/0032_ozen_gilded_effects.sql";
import yeoulQuest from "../../../../lib/db/migrations/0031_yeoul_gold_quest.sql";
import championRules from "../../../../lib/db/migrations/0029_champion_rules.sql";
import aiDifficulty from "../../../../lib/db/migrations/0028_ai_deck_difficulty.sql";

/** Authorized additive installation, serialized across simultaneous server starts. */
export async function ensureTowerStorage(database = db): Promise<void> {
  await database.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ko-card-tower-schema-v1'))`);
    await tx.execute(sql`SET LOCAL lock_timeout = '15s'`);
    for (const migration of [towerStorage, towerUnlocks, aiDifficulty, epicPackConfiguration, draftStorage]) {
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
    await tx.execute(sql.raw(piStarSevenQuest));
    await tx.execute(sql.raw(yeoulQuest));
    await tx.execute(sql.raw(ozenGilded));
    await tx.execute(sql.raw(minionA));
    await tx.execute(sql.raw(towerVanilla));
    for (const statement of maintenanceSchema.split(";")) if(statement.trim()) await tx.execute(sql.raw(statement));
  });
}
