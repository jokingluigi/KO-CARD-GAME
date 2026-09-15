import { and, asc, eq } from "drizzle-orm";
import { db, cardsTable, cardFrameDefinitionsTable, championsTable } from "@workspace/db";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/cards", async (_request, response): Promise<void> => {
  const cards = await db
    .select()
    .from(cardsTable)
    .where(eq(cardsTable.status, "PUBLISHED"))
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

router.get("/champions", async (_request, response): Promise<void> => {
  const champions = await db.select().from(championsTable)
    .where(eq(championsTable.status, "PUBLISHED"))
    .orderBy(asc(championsTable.name));
  response.setHeader("Cache-Control", "no-store");
  response.json({ champions });
});

export default router;