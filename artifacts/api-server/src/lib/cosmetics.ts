import { logger } from "./logger";
import { and, eq, asc, sql } from "drizzle-orm";
import {
  db,
  cosmeticItemsTable as items,
  userCosmeticsTable as owned,
  equippedCosmeticsTable as equips,
  cardsTable,
  championsTable,
} from "@workspace/db";
import {
  emptyCosmetics,
  skinKey,
  validImageUrl,
  type CosmeticItem,
  type CosmeticLoadout,
} from "@workspace/cosmetics";
export { COSMETIC_TYPES, validImageUrl, skinKey } from "@workspace/cosmetics";
export type { CosmeticItem } from "@workspace/cosmetics";
export class CosmeticError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const cosmeticsWriteLock = sql`SELECT pg_advisory_xact_lock(hashtext('ko-cosmetics-write-v1'))`;
export async function loadCosmetics(userId: string): Promise<CosmeticLoadout> {
  const rows = await db
    .select({ slot: equips.slot, item: items })
    .from(equips)
    .innerJoin(
      owned,
      and(
        eq(owned.userId, equips.userId),
        eq(owned.cosmeticId, equips.cosmeticId),
      ),
    )
    .innerJoin(items, eq(items.id, equips.cosmeticId))
    .where(and(eq(equips.userId, userId), eq(items.isActive, true)));
  const result = emptyCosmetics();
  // Do not infer any deck or private card information from the equipped inventory.
  for (const { slot, item: raw } of rows) {
    const item = raw as CosmeticItem;
    if (
      !item.imageAssets ||
      typeof item.imageAssets !== "object" ||
      Array.isArray(item.imageAssets)
    )
      continue;
    const imageAssets = Object.fromEntries(
      Object.entries(item.imageAssets).filter(
        ([key, url]) =>
          ["art", "portrait", "intro", "awakened"].includes(key) &&
          validImageUrl(url),
      ),
    );
    item.imageAssets = imageAssets;
    if (!Object.keys(imageAssets).length) continue;
    if (item.type === "IMAGE_EMOTE" && /^emote:[1-4]$/.test(slot))
      result.emotes[Number(slot.slice(-1)) - 1] = item;
    else if (slot === skinKey(item.type, item.targetId)) {
      if (item.type === "CARD_BACK") result.cardBack = item;
      else result.skins[slot] = item;
    }
  }
  return result;
}
export async function listOwnedCosmetics(userId: string) {
  return db
    .select({ item: items, acquiredAt: owned.acquiredAt })
    .from(owned)
    .innerJoin(items, eq(items.id, owned.cosmeticId))
    .where(eq(owned.userId, userId))
    .orderBy(asc(items.sortOrder), asc(items.name));
}
export async function equipCosmetic(
  userId: string,
  slot: string,
  cosmeticId: string | null,
) {
  if (!/^(back|emote:[1-4]|(?:card|champion):.{1,256})$/.test(slot))
    throw new CosmeticError(400, "장착 슬롯이 올바르지 않습니다.");
  await db.transaction(async (tx) => {
    await tx.execute(cosmeticsWriteLock);
    if (cosmeticId) {
      const [row] = await tx
        .select({ item: items })
        .from(owned)
        .innerJoin(items, eq(items.id, owned.cosmeticId))
        .where(
          and(
            eq(owned.userId, userId),
            eq(owned.cosmeticId, cosmeticId),
            eq(items.isActive, true),
          ),
        );
      if (!row)
        throw new CosmeticError(
          403,
          "보유 중인 활성 아이템만 장착할 수 있습니다.",
        );
      const item = row.item as CosmeticItem;
      if (
        item.type === "IMAGE_EMOTE"
          ? !/^emote:[1-4]$/.test(slot)
          : slot !== skinKey(item.type, item.targetId)
      )
        throw new CosmeticError(422, "아이템과 장착 대상이 일치하지 않습니다.");
      await validateCosmeticTarget(item.type, item.targetId, tx);
      // Moving an emote to another slot is atomic and cannot create duplicates.
      await tx
        .delete(equips)
        .where(
          and(eq(equips.userId, userId), eq(equips.cosmeticId, cosmeticId)),
        );
      await tx
        .insert(equips)
        .values({ userId, slot, cosmeticId })
        .onConflictDoUpdate({
          target: [equips.userId, equips.slot],
          set: { cosmeticId, updatedAt: new Date() },
        });
    } else
      await tx
        .delete(equips)
        .where(and(eq(equips.userId, userId), eq(equips.slot, slot)));
  });
  return loadCosmetics(userId);
}
export async function validateCosmeticTarget(
  type: string,
  targetId: string | null,
  database: Pick<typeof db, "select"> = db,
) {
  if (type === "CHAMPION_SKIN") {
    const [target] = await database
      .select({ id: championsTable.id })
      .from(championsTable)
      .where(eq(championsTable.id, targetId ?? ""))
      .limit(1);
    if (!target) throw new CosmeticError(422, "챔피언을 선택해 주세요.");
  } else if (type === "CARD_SKIN") {
    const [target] = await database
      .select({ id: cardsTable.id })
      .from(cardsTable)
      .where(
        and(
          eq(cardsTable.id, targetId ?? ""),
          eq(cardsTable.cardType, "WRESTLER"),
          eq(cardsTable.isToken, false),
          eq(cardsTable.isChampionToken, false),
        ),
      )
      .limit(1);
    if (!target)
      throw new CosmeticError(422, "토큰이 아닌 선수 카드를 선택해 주세요.");
  } else if (targetId !== null)
    throw new CosmeticError(422, "이 유형에는 적용 대상이 없습니다.");
}

/** Cosmetic failures must not prevent a match from starting. No combat data is mutated. */
export async function loadMatchCosmetics(
  userId: string,
  read = loadCosmetics,
  timeoutMs = 1500,
): Promise<CosmeticLoadout> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(userId),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Cosmetic lookup timeout")),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    logger.warn(
      { err: error },
      "Cosmetics unavailable; using original artwork for this match",
    );
    return emptyCosmetics();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
