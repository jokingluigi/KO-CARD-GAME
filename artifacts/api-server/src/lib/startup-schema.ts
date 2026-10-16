import usageStatistics from '../../../../lib/db/migrations/0052_usage_statistics.sql';
import towerV2Versions from '../../../../lib/db/migrations/0051_tower_v2_versions.sql';
import questPlatform from "../../../../lib/db/migrations/0050_daily_season_quest_platform.sql";
import cardTagCatalog from "../../../../lib/db/migrations/0049_card_tag_catalog.sql";
import aiQuestMatches from '../../../../lib/db/migrations/0038_ai_quest_matches.sql';
import championCraftPermission from "../../../../lib/db/migrations/0040_champion_craft_permission.sql";
import draftStorage from '../../../../lib/db/migrations/0037_admin_draft.sql';
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import epicPackConfiguration from "../../../../lib/db/migrations/0036_epic_pack_configuration.sql";
import towerStorage from "../../../../lib/db/migrations/0026_tower_mode.sql";
import towerUnlocks from "../../../../lib/db/migrations/0027_tower_unlocks.sql";
import maintenanceSchema from "../../../../lib/db/migrations/0033_server_maintenance.sql";
import aiDifficulty from "../../../../lib/db/migrations/0028_ai_deck_difficulty.sql";

/** Schema installation only; administrator-owned catalog content is never replayed.
 * Historical content migrations remain available for explicit, authorized migrations.
 * ON CONFLICT DO NOTHING does not preserve deletions: a deleted ID has no conflict.
 */
export async function ensureTowerStorage(database = db): Promise<void> {
  await database.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '15s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ko-card-tower-schema-v1'))`);
    for (const migration of [towerStorage, towerUnlocks, aiDifficulty, epicPackConfiguration, draftStorage, aiQuestMatches, cardTagCatalog, questPlatform, towerV2Versions, usageStatistics]) {
      // Migration 0026 has standalone transaction delimiters. One outer
      // transaction must own all three migrations and the advisory lock.
      const statements = migration.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gm, "").split(";");
      // These static DDL files contain no function bodies or quoted semicolons.
      // Execute individually for drivers that require one prepared statement.
      for (const statement of statements) {
        if (statement.trim()) await tx.execute(sql.raw(statement));
      }
    }
    await tx.execute(sql.raw(championCraftPermission));
    for (const statement of maintenanceSchema.split(";")) if(statement.trim()) await tx.execute(sql.raw(statement));
  });
}
