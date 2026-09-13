import { randomInt } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  cardsTable,
  championsTable,
  db,
  packDefinitionsTable,
  userCardCollectionsTable,
  userChampionCollectionsTable,
} from "@workspace/db";
import { ensureStarterCollection } from "../lib/collection";
import { getAuthenticatedUser } from "../lib/auth";

const router: IRouter = Router();

function requireUser(request: Request, response: Response) {
  if (request.authUser) return request.authUser;
  response.status(401).json({ message: "로그인이 필요합니다." });
  return null;
}

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
  const user = requireUser(request, response);
  if (!user) return;
  const [cardRows, championRows] = await Promise.all([
    db.select({
      quantity: userCardCollectionsTable.quantity,
      obtainedAt: userCardCollectionsTable.obtainedAt,
      card: cardsTable,
    }).from(userCardCollectionsTable)
      .innerJoin(cardsTable, eq(cardsTable.id, userCardCollectionsTable.cardDefinitionId))
      .where(eq(userCardCollectionsTable.userId, user.id))
      .orderBy(asc(cardsTable.name)),
    db.select({
      owned: userChampionCollectionsTable.owned,
      obtainedAt: userChampionCollectionsTable.obtainedAt,
      champion: championsTable,
    }).from(userChampionCollectionsTable)
      .innerJoin(championsTable, eq(championsTable.id, userChampionCollectionsTable.championDefinitionId))
      .where(and(eq(userChampionCollectionsTable.userId, user.id), eq(userChampionCollectionsTable.owned, true)))
      .orderBy(asc(championsTable.name)),
  ]);
  response.json({
    cards: cardRows.map((row) => ({ ...row.card, quantity: row.quantity, obtainedAt: row.obtainedAt })),
    champions: championRows.map((row) => ({ ...row.champion, obtainedAt: row.obtainedAt })),
  });
});

router.get("/packs", async (_request, response): Promise<void> => {
  const packs = await db.select().from(packDefinitionsTable)
    .where(and(eq(packDefinitionsTable.status, "PUBLISHED"), sql`${packDefinitionsTable.deletedAt} IS NULL`))
    .orderBy(asc(packDefinitionsTable.name));
  response.json({ packs });
});

type Reward =
  | { rewardType: "NORMAL_CARD"; cardDefinitionId: string; card: typeof cardsTable.$inferSelect }
  | { rewardType: "LEGENDARY_CARD"; cardDefinitionId: string; card: typeof cardsTable.$inferSelect }
  | { rewardType: "CHAMPION_UNLOCK"; championDefinitionId: string; champion: typeof championsTable.$inferSelect };

async function rollPack(pack: typeof packDefinitionsTable.$inferSelect): Promise<Reward[]> {
  const [normalCards, legendaryCards, champions] = await Promise.all([
    pack.normalCardPool.length ? db.select().from(cardsTable).where(and(
      inArray(cardsTable.id, pack.normalCardPool),
      eq(cardsTable.status, "PUBLISHED"),
      eq(cardsTable.rarity, "NORMAL"),
      eq(cardsTable.isToken, false),
      eq(cardsTable.isChampionToken, false),
    )) : [],
    pack.legendaryCardPool.length ? db.select().from(cardsTable).where(and(
      inArray(cardsTable.id, pack.legendaryCardPool),
      eq(cardsTable.status, "PUBLISHED"),
      eq(cardsTable.rarity, "LEGENDARY"),
      eq(cardsTable.isToken, false),
      eq(cardsTable.isChampionToken, false),
    )) : [],
    pack.championPool.length ? db.select().from(championsTable).where(and(
      inArray(championsTable.id, pack.championPool),
      eq(championsTable.status, "PUBLISHED"),
    )) : [],
  ]);
  if (pack.normalRate > 0 && normalCards.length === 0) throw new Error("NORMAL 카드 풀이 비어 있어 팩을 열 수 없습니다.");
  if (pack.legendaryRate > 0 && legendaryCards.length === 0) throw new Error("LEGENDARY 카드 풀이 비어 있어 팩을 열 수 없습니다.");
  if (pack.championRate > 0 && champions.length === 0) throw new Error("Champion 풀이 비어 있어 팩을 열 수 없습니다.");

  const rewards: Reward[] = [];
  for (let slot = 0; slot < pack.cardsPerPack; slot += 1) {
    const roll = randomInt(0, 100);
    const category = roll < pack.normalRate
      ? "NORMAL_CARD"
      : roll < pack.normalRate + pack.legendaryRate
        ? "LEGENDARY_CARD"
        : "CHAMPION_UNLOCK";
    if (category === "NORMAL_CARD") {
      const card = normalCards[randomInt(0, normalCards.length)];
      if (card) rewards.push({ rewardType: category, cardDefinitionId: card.id, card });
    } else if (category === "LEGENDARY_CARD") {
      const card = legendaryCards[randomInt(0, legendaryCards.length)];
      if (card) rewards.push({ rewardType: category, cardDefinitionId: card.id, card });
    } else {
      const champion = champions[randomInt(0, champions.length)];
      if (champion) rewards.push({ rewardType: category, championDefinitionId: champion.id, champion });
    }
  }
  return rewards;
}

router.post("/packs/:id/open", async (request, response): Promise<void> => {
  const user = requireUser(request, response);
  if (!user) return;
  const [pack] = await db.select().from(packDefinitionsTable)
    .where(and(eq(packDefinitionsTable.id, request.params.id), eq(packDefinitionsTable.status, "PUBLISHED"), sql`${packDefinitionsTable.deletedAt} IS NULL`))
    .limit(1);
  if (!pack) {
    response.status(404).json({ message: "공개된 팩을 찾을 수 없습니다." });
    return;
  }
  try {
    const rewards = await rollPack(pack);
    await db.transaction(async (tx) => {
      for (const reward of rewards) {
        if (reward.rewardType === "CHAMPION_UNLOCK") {
          await tx.insert(userChampionCollectionsTable).values({
            userId: user.id,
            championDefinitionId: reward.championDefinitionId,
            owned: true,
          }).onConflictDoUpdate({
            target: [userChampionCollectionsTable.userId, userChampionCollectionsTable.championDefinitionId],
            set: { owned: true },
          });
        } else {
          await tx.insert(userCardCollectionsTable).values({
            userId: user.id,
            cardDefinitionId: reward.cardDefinitionId,
            quantity: 1,
          }).onConflictDoUpdate({
            target: [userCardCollectionsTable.userId, userCardCollectionsTable.cardDefinitionId],
            set: {
              quantity: sql`${userCardCollectionsTable.quantity} + 1`,
              obtainedAt: new Date(),
            },
          });
        }
      }
    });
    response.json({
      rewards: rewards.map((reward) => reward.rewardType === "CHAMPION_UNLOCK"
        ? { rewardType: reward.rewardType, championDefinitionId: reward.championDefinitionId, champion: reward.champion }
        : { rewardType: reward.rewardType, cardDefinitionId: reward.cardDefinitionId, card: reward.card }),
    });
  } catch (error) {
    response.status(422).json({ message: error instanceof Error ? error.message : "현재 이 팩은 개봉할 수 없습니다." });
  }
});

export { rollPack };
export default router;