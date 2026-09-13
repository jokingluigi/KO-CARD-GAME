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

export { rollPack };
export default router;