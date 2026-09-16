import { and, asc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { cardsTable, championsTable, db } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { listAIDecks } from "../lib/ai-deck-service";

const router: IRouter = Router();

router.use(async (request, response, next) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      response.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    request.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/", async (request: Request, response: Response): Promise<void> => {
  const testDeckId = typeof request.query.testDeckId === "string" ? request.query.testDeckId : null;
  const decks = testDeckId && request.authUser?.role === "ADMIN"
    ? (await listAIDecks()).filter((deck) => deck.id === testDeckId)
    : await listAIDecks({ enabledOnly: true });
  response.setHeader("Cache-Control", "no-store");
  response.json({ decks: decks.filter((deck) => deck.isValid).map(({ invalidReasons: _invalidReasons, missingCardDefinitionIds: _missing, ...deck }) => deck) });
});

export default router;