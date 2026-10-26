import { and, eq, inArray } from "drizzle-orm";
import { db, cosmeticItemsTable, championsTable } from "@workspace/db";
/** Uses the existing skin pool; no new economy, pool table, or acquisition record. */
export async function championSkinPool(
  ids?: string[],
  executor: Pick<typeof db, "select"> = db,
) {
  if (ids && !ids.length) return [];
  return executor
    .select({ cosmetic: cosmeticItemsTable, champion: championsTable })
    .from(cosmeticItemsTable)
    .innerJoin(
      championsTable,
      eq(championsTable.id, cosmeticItemsTable.targetId),
    )
    .where(
      and(
        eq(cosmeticItemsTable.type, "CHAMPION_SKIN"),
        eq(cosmeticItemsTable.isActive, true),
        eq(championsTable.status, "PUBLISHED"),
        ids ? inArray(cosmeticItemsTable.id, ids) : undefined,
      ),
    );
}
