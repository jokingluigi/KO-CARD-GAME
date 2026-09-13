import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  db,
  packDefinitionsTable,
  userCardCollectionsTable,
  userChampionCollectionsTable,
  userPackInventoryTable,
  cardsTable,
  championsTable,
} from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { ensureStarterCollection } from "../lib/collection";

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
      const [normalCards, legendaryCards, champions] = await Promise.all([
        pack.normalCardPool.length ? tx.select().from(cardsTable).where(and(
          inArray(cardsTable.id, pack.normalCardPool), eq(cardsTable.status, "PUBLISHED"),
          eq(cardsTable.rarity, "NORMAL"), eq(cardsTable.isToken, false), eq(cardsTable.isChampionToken, false),
        )) : [],
        pack.legendaryCardPool.length ? tx.select().from(cardsTable).where(and(
          inArray(cardsTable.id, pack.legendaryCardPool), eq(cardsTable.status, "PUBLISHED"),
          eq(cardsTable.rarity, "LEGENDARY"), eq(cardsTable.isToken, false), eq(cardsTable.isChampionToken, false),
        )) : [],
        pack.championPool.length ? tx.select().from(championsTable).where(and(
          inArray(championsTable.id, pack.championPool), eq(championsTable.status, "PUBLISHED"),
        )) : [],
      ]);
      if (pack.normalRate > 0 && normalCards.length === 0) throw new Error("NORMAL 카드 Pool이 비어 있습니다.");
      if (pack.legendaryRate > 0 && legendaryCards.length === 0) throw new Error("LEGENDARY 카드 Pool이 비어 있습니다.");
      if (pack.championRate > 0 && champions.length === 0) throw new Error("Champion Pool이 비어 있습니다.");
      const [spent] = await tx.update(userPackInventoryTable).set({
        quantity: sql`${userPackInventoryTable.quantity} - 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(userPackInventoryTable.userId, request.authUser!.id),
        eq(userPackInventoryTable.packDefinitionId, pack.id),
        sql`${userPackInventoryTable.quantity} > 0`,
      )).returning();
      if (!spent) throw new Error("보유한 팩이 없습니다.");

      const nextRewards: Array<Record<string, unknown>> = [];
      for (let slot = 0; slot < pack.cardsPerPack; slot += 1) {
        const roll = randomInt(0, 100);
        const rewardType = roll < pack.normalRate
          ? "NORMAL_CARD"
          : roll < pack.normalRate + pack.legendaryRate
            ? "LEGENDARY_CARD"
            : "CHAMPION_UNLOCK";
        if (rewardType === "NORMAL_CARD") {
          const card = normalCards[randomInt(0, normalCards.length)];
          if (!card) throw new Error("NORMAL 카드 보상을 결정할 수 없습니다.");
          nextRewards.push({ rewardType, cardDefinitionId: card.id, card });
          await tx.insert(userCardCollectionsTable).values({
            userId: request.authUser!.id, cardDefinitionId: card.id, quantity: 1,
          }).onConflictDoUpdate({
            target: [userCardCollectionsTable.userId, userCardCollectionsTable.cardDefinitionId],
            set: { quantity: sql`${userCardCollectionsTable.quantity} + 1`, obtainedAt: new Date() },
          });
        } else if (rewardType === "LEGENDARY_CARD") {
          const card = legendaryCards[randomInt(0, legendaryCards.length)];
          if (!card) throw new Error("LEGENDARY 카드 보상을 결정할 수 없습니다.");
          nextRewards.push({ rewardType, cardDefinitionId: card.id, card });
          await tx.insert(userCardCollectionsTable).values({
            userId: request.authUser!.id, cardDefinitionId: card.id, quantity: 1,
          }).onConflictDoUpdate({
            target: [userCardCollectionsTable.userId, userCardCollectionsTable.cardDefinitionId],
            set: { quantity: sql`${userCardCollectionsTable.quantity} + 1`, obtainedAt: new Date() },
          });
        } else {
          const champion = champions[randomInt(0, champions.length)];
          if (!champion) throw new Error("Champion 보상을 결정할 수 없습니다.");
          const [existingChampion] = await tx.select({ owned: userChampionCollectionsTable.owned })
            .from(userChampionCollectionsTable)
            .where(and(
              eq(userChampionCollectionsTable.userId, request.authUser!.id),
              eq(userChampionCollectionsTable.championDefinitionId, champion.id),
            ))
            .limit(1);
          nextRewards.push({
            rewardType,
            championDefinitionId: champion.id,
            champion,
            alreadyOwned: existingChampion?.owned === true,
          });
          await tx.insert(userChampionCollectionsTable).values({
            userId: request.authUser!.id, championDefinitionId: champion.id, owned: true,
          }).onConflictDoUpdate({
            target: [userChampionCollectionsTable.userId, userChampionCollectionsTable.championDefinitionId],
            set: { owned: true, obtainedAt: new Date() },
          });
        }
      }
      rewards = nextRewards;
    });
    response.json({ rewards });
  } catch (error) {
    response.status(error instanceof Error && error.message === "공개된 팩을 찾을 수 없습니다." ? 404 : 422)
      .json({ message: error instanceof Error ? error.message : "현재 이 팩은 개봉할 수 없습니다." });
  }
});

export default router;