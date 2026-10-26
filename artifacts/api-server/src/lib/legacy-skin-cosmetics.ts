import { and, eq, sql, isNull, or, lt, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  cardSkinDefinitionsTable as skins,
  cosmeticItemsTable as items,
  userCosmeticsTable as owned,
  userCardSkinCollectionsTable as legacyOwned,
  equippedCosmeticsTable as equips,
  packDefinitionsTable as packs,
  cosmeticAuditTable as audit,
} from "@workspace/db";
import type { CosmeticItem } from "@workspace/cosmetics";
import { AdminDeletionError } from "./admin-content-deletion";
const PREFIX = "pack-skin:";
export const legacySkinId = (id: string) =>
  id.startsWith(PREFIX) ? id.slice(PREFIX.length) : null;
export const legacyCosmeticId = (id: string) => PREFIX + id;
export function legacySkinItem(s: typeof skins.$inferSelect): CosmeticItem {
  return {
    id: legacyCosmeticId(s.id),
    type: "CARD_SKIN",
    name: s.name,
    description: s.description,
    targetId: s.cardDefinitionId,
    imageAssets: s.imageUrl
      ? {
          art: s.imageUrl,
          __display: JSON.stringify({
            art: {
              imageDisplayMode: s.imageDisplayMode,
              imageScale: s.imageScale,
              imagePositionX: s.imagePositionX,
              imagePositionY: s.imagePositionY,
            },
          }),
        }
      : {},
    isActive: s.status === "PUBLISHED",
    sortOrder: 0,
    legacySkinId: s.id,
    publicationStatus: s.status as CosmeticItem["publicationStatus"],
  };
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Stable presentation bridge. Original pack IDs, probability pools and acquisition rows are retained. */
export async function syncLegacySkin(id: string, tx: Tx) {
  const [s] = await tx.select().from(skins).where(eq(skins.id, id));
  if (!s) throw new AdminDeletionError(404, "카드팩 스킨을 찾을 수 없습니다.");
  const item = legacySkinItem(s);
  const [previous] = await tx
    .select({ targetId: items.targetId, sortOrder: items.sortOrder })
    .from(items)
    .where(eq(items.id, item.id));
  if (previous && previous.targetId !== item.targetId)
    await tx.delete(equips).where(eq(equips.cosmeticId, item.id));
  const { legacySkinId: _legacy, publicationStatus: _status, ...base } = item;
  const row: typeof items.$inferInsert = {
    ...base,
    sortOrder: previous?.sortOrder ?? 0,
    imageAssets: Object.fromEntries(
      Object.entries(item.imageAssets).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  };
  await tx
    .insert(items)
    .values(row)
    .onConflictDoUpdate({
      target: items.id,
      set: { ...row, updatedAt: new Date() },
    });
  return { ...item, sortOrder: row.sortOrder as number };
}
export async function hydrateLegacySkins(userId: string) {
  const rows = await db
    .select({ id: skins.id })
    .from(legacyOwned)
    .innerJoin(skins, eq(skins.id, legacyOwned.skinDefinitionId))
    .leftJoin(items, sql`${items.id}='pack-skin:'||${skins.id}`)
    .leftJoin(
      owned,
      and(eq(owned.userId, userId), eq(owned.cosmeticId, items.id)),
    )
    .where(
      and(
        eq(legacyOwned.userId, userId),
        or(
          isNull(items.id),
          isNull(owned.cosmeticId),
          lt(items.updatedAt, skins.updatedAt),
        ),
      ),
    );
  if (!rows.length) return;
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('ko-cosmetics-write-v1'))`,
    );
    // Re-read inside the lock so a revoke/delete cannot grant a stale entitlement.
    const current = await tx
      .select({ id: skins.id })
      .from(legacyOwned)
      .innerJoin(skins, eq(skins.id, legacyOwned.skinDefinitionId))
      .where(
        and(
          eq(legacyOwned.userId, userId),
          inArray(
            skins.id,
            rows.map((row) => row.id),
          ),
        ),
      );
    for (const { id } of current) {
      const item = await syncLegacySkin(id, tx);
      await tx
        .insert(owned)
        .values({
          userId,
          cosmeticId: item.id,
          acquisitionSource: "LEGACY_PACK_SKIN",
        })
        .onConflictDoNothing();
    }
  });
}
export async function grantLegacySkin(userId: string, id: string, tx: Tx) {
  const item = await syncLegacySkin(id, tx);
  await tx
    .insert(legacyOwned)
    .values({ userId, skinDefinitionId: id })
    .onConflictDoNothing();
  await tx
    .insert(owned)
    .values({
      userId,
      cosmeticId: item.id,
      acquisitionSource: "LEGACY_PACK_SKIN",
    })
    .onConflictDoNothing();
  return item;
}
export async function revokeLegacySkin(userId: string, id: string, tx: Tx) {
  await tx
    .delete(owned)
    .where(
      and(eq(owned.userId, userId), eq(owned.cosmeticId, legacyCosmeticId(id))),
    );
  await tx
    .delete(legacyOwned)
    .where(
      and(eq(legacyOwned.userId, userId), eq(legacyOwned.skinDefinitionId, id)),
    );
}
export async function deleteLegacySkin(id: string, adminId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('ko-cosmetics-write-v1'))`,
    );
    const [skin] = await tx
      .select()
      .from(skins)
      .where(eq(skins.id, id))
      .for("update");
    if (!skin)
      throw new AdminDeletionError(404, "카드팩 스킨을 찾을 수 없습니다.");
    const references = await tx
      .select({ name: packs.name })
      .from(packs)
      .where(
        and(sql`${id}=ANY(${packs.skinPool})`, sql`${packs.deletedAt} IS NULL`),
      );
    if (references.length)
      throw new AdminDeletionError(
        409,
        `다음 팩의 스킨 풀에서 먼저 제거해 주세요: ${references.map((p) => p.name).join(", ")}`,
      );
    const cosmeticId = legacyCosmeticId(id);
    await tx.delete(equips).where(eq(equips.cosmeticId, cosmeticId));
    await tx.delete(owned).where(eq(owned.cosmeticId, cosmeticId));
    await tx.delete(items).where(eq(items.id, cosmeticId));
    await tx.delete(skins).where(eq(skins.id, id));
    await tx.insert(audit).values({
      id: randomUUID(),
      actorId: adminId,
      cosmeticId,
      action: "DELETE",
    });
  });
}
