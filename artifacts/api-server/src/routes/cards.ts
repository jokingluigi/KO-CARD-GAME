import { asc, eq } from "drizzle-orm";
import { db, cardsTable } from "@workspace/db";
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

export default router;