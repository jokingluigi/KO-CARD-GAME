import { and, asc, eq, ne, or, inArray, gt } from "drizzle-orm";
import { db, cardsTable, cardFrameDefinitionsTable, championsTable, userCardCollectionsTable, userChampionCollectionsTable } from "@workspace/db";
import { Router, type IRouter } from "express";

import { completeMinionACatalog } from "@workspace/game-engine";
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
  const cards = await db
    .select()
    .from(cardsTable)
    .where(user?.role === "ADMIN" ? ne(cardsTable.status, "DISABLED") : or(eq(cardsTable.status, "PUBLISHED"), and(eq(cardsTable.status,"DRAFT"),inArray(cardsTable.id,owned.map(row=>row.id)))))
    .orderBy(asc(cardsTable.name));

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