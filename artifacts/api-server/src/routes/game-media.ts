import { asc, eq } from "drizzle-orm";
import { gameMediaTable, db } from "@workspace/db";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/game-media", async (_request, response): Promise<void> => {
  const media = await db
    .select({
      id: gameMediaTable.id,
      mediaType: gameMediaTable.mediaType,
      name: gameMediaTable.name,
      assetUrl: gameMediaTable.assetUrl,
      width: gameMediaTable.width,
      height: gameMediaTable.height,
      volume: gameMediaTable.volume,
    })
    .from(gameMediaTable)
    .where(eq(gameMediaTable.enabled, true))
    .orderBy(asc(gameMediaTable.createdAt));

  response.setHeader("Cache-Control", "no-store");
  response.json({ media });
});

export default router;