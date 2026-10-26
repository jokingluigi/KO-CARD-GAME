import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

/** Real ownership preserves the equipment FK and authoritative match snapshots.
 * Only skins are granted. Originals, balances, backs and emotes are untouched.
 */
export async function ensureAdminSkins(userId: string) {
  const [user] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (user?.role !== "ADMIN") return;
  await db.transaction(async (tx) => {
    // Serialize with skin edits/grants and recheck the actual role under a row lock.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('ko-cosmetics-write-v1'))`,
    );
    const [current] = await tx
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("share");
    if (current?.role !== "ADMIN") return;
    await tx.execute(sql`
      INSERT INTO user_cosmetics (user_id, cosmetic_id, acquisition_source)
      SELECT ${userId}, id, 'ADMIN_SKINS' FROM cosmetic_items
      WHERE is_active = true AND type IN ('CHAMPION_SKIN', 'CARD_SKIN')
      ON CONFLICT (user_id, cosmetic_id) DO NOTHING
    `);
    await tx.execute(sql`
      INSERT INTO user_card_skin_collections (user_id, skin_definition_id)
      SELECT ${userId}, s.id FROM card_skin_definitions s
      JOIN cards c ON c.id = s.card_definition_id
      WHERE s.status IN ('PUBLISHED', 'DRAFT') AND c.status IN ('PUBLISHED', 'DRAFT')
        AND c.is_token = false AND c.is_champion_token = false
      ON CONFLICT (user_id, skin_definition_id) DO NOTHING
    `);
  });
}
