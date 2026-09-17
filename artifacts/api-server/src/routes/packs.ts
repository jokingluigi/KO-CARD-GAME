import { and, asc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  packDefinitionsTable,
  userCardCollectionsTable,
  userChampionCollectionsTable,
  userCardSkinCollectionsTable,
  userPackInventoryTable,
} from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { ensureStarterCollection } from "../lib/collection";
import { rollPack } from "./collection";
import { getPackDetails } from "../lib/pack-details";

const router: IRouter = Router();

router.use(async (request, response, next) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      response.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    request.authUser = user;
    await ensureStarterCollection(user.id);
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/", async (request, response): Promise<void> => {
  const packs = await db.select({
    pack: packDefinitionsTable,
    quantity: sql<number>`coalesce(${userPackInventoryTable.quantity}, 0)::int`,
  }).from(packDefinitionsTable)
    .leftJoin(userPackInventoryTable, and(
      eq(userPackInventoryTable.packDefinitionId, packDefinitionsTable.id),
      eq(userPackInventoryTable.userId, request.authUser!.id),
    ))
    .where(and(eq(packDefinitionsTable.status, "PUBLISHED"), sql`${packDefinitionsTable.deletedAt} IS NULL`))
    .orderBy(asc(packDefinitionsTable.name));
  response.json({ packs: packs.map(({ pack, quantity }) => ({ ...pack, quantity })) });
});

router.get("/:id/details", async (request, response): Promise<void> => {
  const [pack] = await db.select().from(packDefinitionsTable)
    .where(and(
      eq(packDefinitionsTable.id, request.params.id),
      eq(packDefinitionsTable.status, "PUBLISHED"),
      sql`${packDefinitionsTable.deletedAt} IS NULL`,
    ))
    .limit(1);
  if (!pack) {
    response.status(404).json({ message: "공개된 팩을 찾을 수 없습니다." });
    return;
  }
  response.json({ pack, details: await getPackDetails(pack) });
});

router.post("/:id/open", async (request, response): Promise<void> => {
  try {
    let rewards: Array<Record<string, unknown>> = [];
    await db.transaction(async (tx) => {
      const [pack] = await tx.select().from(packDefinitionsTable)
        .where(and(eq(packDefinitionsTable.id, request.params.id), eq(packDefinitionsTable.status, "PUBLISHED"), sql`${packDefinitionsTable.deletedAt} IS NULL`))
        .limit(1);
      if (!pack) throw new Error("공개된 팩을 찾을 수 없습니다.");
      if (pack.normalRate + pack.legendaryRate + pack.championRate !== 100) {
        throw new Error("팩 확률 설정이 올바르지 않습니다.");
      }
      const [spent] = await tx.update(userPackInventoryTable).set({
        quantity: sql`${userPackInventoryTable.quantity} - 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(userPackInventoryTable.userId, request.authUser!.id),
        eq(userPackInventoryTable.packDefinitionId, pack.id),
        sql`${userPackInventoryTable.quantity} > 0`,
      )).returning();
      if (!spent) throw new Error("보유한 팩이 없습니다.");

      const nextRewards = await rollPack(pack, tx);
      for (const reward of nextRewards) {
        if (reward.rewardType === "NORMAL_CARD" || reward.rewardType === "LEGENDARY_CARD") {
          const card = reward.card;
          await tx.insert(userCardCollectionsTable).values({
            userId: request.authUser!.id, cardDefinitionId: card.id, quantity: 1,
          }).onConflictDoUpdate({
            target: [userCardCollectionsTable.userId, userCardCollectionsTable.cardDefinitionId],
            set: { quantity: sql`${userCardCollectionsTable.quantity} + 1`, obtainedAt: new Date() },
          });
        } else if (reward.rewardType === "CHAMPION_UNLOCK") {
          const champion = reward.champion;
          const [existingChampion] = await tx.select({ owned: userChampionCollectionsTable.owned })
            .from(userChampionCollectionsTable)
            .where(and(
              eq(userChampionCollectionsTable.userId, request.authUser!.id),
              eq(userChampionCollectionsTable.championDefinitionId, champion.id),
            ))
            .limit(1);
          reward.alreadyOwned = existingChampion?.owned === true;
          await tx.insert(userChampionCollectionsTable).values({
            userId: request.authUser!.id, championDefinitionId: champion.id, owned: true,
          }).onConflictDoUpdate({
            target: [userChampionCollectionsTable.userId, userChampionCollectionsTable.championDefinitionId],
            set: { owned: true, obtainedAt: new Date() },
          });
        } else {
          const [existingSkin] = await tx.select({ id: userCardSkinCollectionsTable.skinDefinitionId })
            .from(userCardSkinCollectionsTable)
            .where(and(
              eq(userCardSkinCollectionsTable.userId, request.authUser!.id),
              eq(userCardSkinCollectionsTable.skinDefinitionId, reward.skinDefinitionId),
            )).limit(1);
          reward.alreadyOwned = Boolean(existingSkin);
          await tx.insert(userCardSkinCollectionsTable).values({
            userId: request.authUser!.id,
            skinDefinitionId: reward.skinDefinitionId,
          }).onConflictDoNothing();
        }
      }
      rewards = nextRewards.map((reward) => reward.rewardType === "CHAMPION_UNLOCK"
        ? { ...reward, alreadyOwned: reward.alreadyOwned ?? false }
        : reward);
    });
    response.json({ rewards });
  } catch (error) {
    response.status(error instanceof Error && error.message === "공개된 팩을 찾을 수 없습니다." ? 404 : 422)
      .json({ message: error instanceof Error ? error.message : "현재 이 팩은 개봉할 수 없습니다." });
  }
});

export default router;