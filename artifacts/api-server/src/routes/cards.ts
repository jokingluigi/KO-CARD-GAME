import { expandNamedCardReferences } from '../lib/named-card-references';
import { and, asc, eq, ne, or, inArray, gt } from "drizzle-orm";
import { db, cardsTable, cardFrameDefinitionsTable, championsTable, userCardCollectionsTable, userChampionCollectionsTable } from "@workspace/db";
import { Router, type IRouter } from "express";

import { completeMinionACatalog, ZOMBIE_RULES } from "@workspace/game-engine";
import { getAuthenticatedUser } from "../lib/auth";

const router: IRouter = Router();

router.get("/minion-a/cards", async (request, response): Promise<void> => {
  if (!await getAuthenticatedUser(request)) { response.status(401).json({ message: "로그인이 필요합니다." }); return; }
  const cards = await db.select().from(cardsTable);
  response.setHeader("Cache-Control", "no-store");
  response.json({ definitions: completeMinionACatalog(cards) });
});

router.get("/cards", async (request, response): Promise<void> => {
  const user = await getAuthenticatedUser(request);
  const owned = user ? await db.select({id:userCardCollectionsTable.cardDefinitionId}).from(userCardCollectionsTable).where(and(eq(userCardCollectionsTable.userId,user.id),gt(userCardCollectionsTable.quantity,0))) : [];
  const allCards = await db.select().from(cardsTable).where(ne(cardsTable.status, "DISABLED")).orderBy(asc(cardsTable.name));
  const ownedIds = new Set(owned.map(row => row.id));
  const requiredIds = new Set(allCards.filter(card => user?.role === 'ADMIN' || card.status === 'PUBLISHED' || ownedIds.has(card.id)).map(card => card.id));
  expandNamedCardReferences(allCards, requiredIds);
  const cards = allCards.filter(card => requiredIds.has(card.id)).map(card => card.name === '디 오리진'
    ? { ...card, text: card.text.replace(/선수(?:\s*카드)?\s*\d+\s*장당/u, '선수 2장당') } : card.isToken && card.name.trim() === '좀비' ? { ...card, text: ZOMBIE_RULES } : card);

  response.setHeader("Cache-Control", "no-store");
  response.json({ cards });
});

router.get("/card-frames", async (_request, response): Promise<void> => {
  const frames = await db
    .select({
      cardType: cardFrameDefinitionsTable.cardType,
      rarity: cardFrameDefinitionsTable.rarity,
      frameUrl: cardFrameDefinitionsTable.frameUrl,
      enabled: cardFrameDefinitionsTable.enabled,
      frameScale: cardFrameDefinitionsTable.frameScale,
      frameOffsetX: cardFrameDefinitionsTable.frameOffsetX,
      frameOffsetY: cardFrameDefinitionsTable.frameOffsetY,
    })
    .from(cardFrameDefinitionsTable)
    .where(and(
      eq(cardFrameDefinitionsTable.enabled, true),
    ));
  response.setHeader("Cache-Control", "no-store");
  response.json({ frames });
});

router.get("/champions", async (request, response): Promise<void> => {
  const user = await getAuthenticatedUser(request);
  const owned = user ? await db.select({id:userChampionCollectionsTable.championDefinitionId}).from(userChampionCollectionsTable).where(and(eq(userChampionCollectionsTable.userId,user.id),eq(userChampionCollectionsTable.owned,true))) : [];
  const champions = await db.select().from(championsTable)
    .where(user?.role === "ADMIN" ? ne(championsTable.status, "DISABLED") : or(eq(championsTable.status, "PUBLISHED"), and(eq(championsTable.status,"DRAFT"),inArray(championsTable.id,owned.map(row=>row.id)))))
    .orderBy(asc(championsTable.name));
  response.setHeader("Cache-Control", "no-store");
  response.json({ champions });
});

export default router;