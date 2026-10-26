import { eq, sql } from "drizzle-orm";
import {
  db,
  questSeasonsTable,
  dailyQuestDefinitionsTable,
  dailyQuestAssignmentsTable,
  questAdminAuditTable,
  towerSeasonsTable,
  towerStartersTable,
  towerPresetsTable,
  towerRelicsTable,
  towerCharactersTable,
  towerScenesTable,
  towerMetadataTable,
  towerRunsTable,
  towerVersionsTable,
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
export const towerCatalogWriteLock = sql`SELECT pg_advisory_xact_lock(hashtext('tower:catalog-write'))`;
export const questCatalogWriteLock = sql`SELECT pg_advisory_xact_lock(hashtext('quest:catalog-write'))`;
const towerTables = {
  seasons: towerSeasonsTable,
  starters: towerStartersTable,
  presets: towerPresetsTable,
  relics: towerRelicsTable,
  characters: towerCharactersTable,
  scenes: towerScenesTable,
  metadata: towerMetadataTable,
};
export type TowerCatalogKind = keyof typeof towerTables;
function references(value: unknown, id: string): boolean {
  if (typeof value === "string") return value === id;
  if (Array.isArray(value)) return value.some((v) => references(v, id));
  return (
    !!value &&
    typeof value === "object" &&
    Object.values(value).some((v) => references(v, id))
  );
}
export async function deleteTowerCatalog(
  kind: TowerCatalogKind,
  id: string,
  metadataKind?: string,
) {
  const table = towerTables[kind];
  await db.transaction(async (tx) => {
    await tx.execute(towerCatalogWriteLock);
    const [row] = await tx
      .select()
      .from(table)
      .where(eq(table.id, id))
      .for("update");
    if (
      !row ||
      (kind === "metadata" && "kind" in row && row.kind !== metadataKind)
    )
      throw new AdminDeletionError(404, "삭제할 타워 항목을 찾을 수 없습니다.");
    if (kind === "seasons") {
      if ("active" in row && row.active)
        throw new AdminDeletionError(
          409,
          "활성 시즌은 먼저 비활성화해 주세요.",
        );
      const [run] = await tx
        .select({ id: towerRunsTable.id })
        .from(towerRunsTable)
        .where(eq(towerRunsTable.seasonId, id))
        .limit(1);
      const [version] = await tx
        .select({ id: towerVersionsTable.id })
        .from(towerVersionsTable)
        .where(eq(towerVersionsTable.towerId, id))
        .limit(1);
      if (run || version)
        throw new AdminDeletionError(
          409,
          "공개 버전 또는 도전 기록이 있는 타워는 삭제할 수 없습니다. 사용·공개 표시를 꺼 주세요.",
        );
    }
    if (kind !== "metadata") {
      const dependents: string[] = [];
      for (const [otherKind, otherTable] of Object.entries(towerTables)) {
        if (otherKind === "metadata") continue;
        const rows = await tx.select().from(otherTable);
        for (const other of rows) {
          if (otherKind === kind && other.id === id) continue;
          if (references(other.data, id))
            dependents.push(
              String(other.data.name ?? other.data.displayName ?? other.id),
            );
        }
      }
      if (dependents.length)
        throw new AdminDeletionError(
          409,
          `다음 타워 항목에서 먼저 연결을 해제해 주세요: ${dependents.slice(0, 8).join(", ")}`,
        );
    }
    await tx.delete(table).where(eq(table.id, id));
  });
}
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
