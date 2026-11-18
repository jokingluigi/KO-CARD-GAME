import { eq, sql } from "drizzle-orm";
import {
  db,
  questSeasonsTable,
  dailyQuestDefinitionsTable,
  dailyQuestAssignmentsTable,
  questAdminAuditTable,
} from "@workspace/db";
import { randomUUID } from "node:crypto";
export class AdminDeletionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const questCatalogWriteLock = sql`SELECT pg_advisory_xact_lock(hashtext('quest:catalog-write'))`;
export async function deleteQuestSeason(id: string, adminId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(questCatalogWriteLock);
    const [season] = await tx
      .select()
      .from(questSeasonsTable)
      .where(eq(questSeasonsTable.id, id))
      .for("update");
    if (!season) throw new AdminDeletionError(404, "시즌을 찾을 수 없습니다.");
    const [definition] = await tx
      .select({ id: dailyQuestDefinitionsTable.id })
      .from(dailyQuestDefinitionsTable)
      .where(
        sql`${dailyQuestDefinitionsTable.platform}->>'seasonId' = ${id} AND COALESCE(${dailyQuestDefinitionsTable.platform}->>'deletedAt','') = ''`,
      )
      .limit(1);
    const [assignment] = await tx
      .select({ id: dailyQuestAssignmentsTable.id })
      .from(dailyQuestAssignmentsTable)
      .where(sql`${dailyQuestAssignmentsTable.platform}->>'seasonId' = ${id}`)
      .limit(1);
    if (definition || assignment)
      throw new AdminDeletionError(
        409,
        "연결된 퀘스트 또는 배정·보상 기록이 있어 삭제할 수 없습니다. 시즌 보관을 사용해 주세요.",
      );
    await tx.delete(questSeasonsTable).where(eq(questSeasonsTable.id, id));
    await tx
      .insert(questAdminAuditTable)
      .values({
        id: randomUUID(),
        adminId,
        action: "SEASON_DELETED",
        entityId: id,
        configuration: season,
      });
  });
}
