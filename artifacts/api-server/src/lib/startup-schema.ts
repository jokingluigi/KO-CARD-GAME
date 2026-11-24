import bossMode from "../../../../lib/db/migrations/0061_boss_mode.sql";
import attendanceCycles from "../../../../lib/db/migrations/0060_attendance_cycles.sql";
import cardTagDisplayNames from "../../../../lib/db/migrations/0057_card_tag_display_names.sql";
import questProgressOutbox from '../../../../lib/db/migrations/0058_quest_progress_outbox.sql';
import cardLore from '../../../../lib/db/migrations/0059_card_lore.sql';
import aiDeckCosmetics from "../../../../lib/db/migrations/0055_ai_deck_cosmetics.sql";
import packEmoteRates from "../../../../lib/db/migrations/0056_pack_emote_rates.sql";
import shopDecks from "../../../../lib/db/migrations/0054_shop_decks.sql";
import cosmetics from '../../../../lib/db/migrations/0053_cosmetics.sql';
import usageStatistics from '../../../../lib/db/migrations/0052_usage_statistics.sql';
import questPlatform from "../../../../lib/db/migrations/0050_daily_season_quest_platform.sql";
import cardTagCatalog from "../../../../lib/db/migrations/0049_card_tag_catalog.sql";
import aiQuestMatches from '../../../../lib/db/migrations/0038_ai_quest_matches.sql';
import championCraftPermission from "../../../../lib/db/migrations/0040_champion_craft_permission.sql";
import draftStorage from '../../../../lib/db/migrations/0037_admin_draft.sql';
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import epicPackConfiguration from "../../../../lib/db/migrations/0036_epic_pack_configuration.sql";
import maintenanceSchema from "../../../../lib/db/migrations/0033_server_maintenance.sql";
import aiDifficulty from "../../../../lib/db/migrations/0028_ai_deck_difficulty.sql";

/** Schema installation only; administrator-owned catalog content is never replayed.
 * Historical content migrations remain available for explicit, authorized migrations.
 * ON CONFLICT DO NOTHING does not preserve deletions: a deleted ID has no conflict.
 */
// The historical analytics migration also contains retired-mode DDL. Do not require
// or recreate those archived tables when installing the supported application schema.
const activeUsageStorage=usageStatistics
 .replace(/^\s*(?:ALTER TABLE tower_runs|CREATE INDEX IF NOT EXISTS tower_runs_)[^\r\n]*$/gm,'')
 .replace(/,'tower_runs'/g,'');
export async function ensureApplicationStorage(database = db): Promise<void> {
  await database.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '15s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '30s'`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ko-card-application-schema-v1'))`);
    for (const migration of [aiDifficulty, epicPackConfiguration, draftStorage, aiQuestMatches, cardTagCatalog, cardTagDisplayNames, questPlatform, activeUsageStorage, cosmetics, shopDecks, aiDeckCosmetics, packEmoteRates,questProgressOutbox,cardLore,attendanceCycles,bossMode]) {
      // One outer transaction owns application migrations and the advisory lock.
      const statements = migration.replace(/^\s*--[^\r\n]*$/gm, "").replace(/^\s*(?:BEGIN|COMMIT);\s*$/gm, "").split(";");
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
