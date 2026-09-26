import { and, asc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { cardsTable, championsTable, db } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { listAIDecks } from "../lib/ai-deck-service";
import { expandNamedCardReferences } from "../lib/named-card-references";

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
    : (await listAIDecks({ enabledOnly: true, context: "AI_DECK" })).filter((deck) =>
        deck.champion?.status !== "DISABLED" &&
        deck.cards.every((card) => card.status !== "DISABLED"),
      );
  const available = decks.filter((deck) => deck.isValid);
  const cardIds = [...new Set(available.flatMap((deck) => [...deck.cardDefinitionIds, ...deck.requiredCardDefinitionIds]))];
  const championIds = [...new Set(available.map((deck) => deck.championDefinitionId).filter((id): id is string => Boolean(id)))];
  const [extraCards, extraChampions] = await Promise.all([
    cardIds.length ? db.select().from(cardsTable).where(inArray(cardsTable.id, cardIds)) : [],
    championIds.length ? db.select().from(championsTable).where(inArray(championsTable.id, championIds)) : [],
  ]);
  // Cards mentioned by older name-only transform effects are needed in the
  // client match pool, even when the form is DRAFT and absent from the AI deck.
  const extraCardsWithReferences: Array<typeof cardsTable.$inferSelect> = [...extraCards];
  if (extraCards.length) {
    const allCards = await db.select().from(cardsTable);
    const referencedIds = new Set(extraCards.map((card) => card.id));
    expandNamedCardReferences(allCards, referencedIds);
    for (const card of allCards) {
      if (referencedIds.has(card.id) && card.status !== "DISABLED" && !extraCardsWithReferences.some((item) => item.id === card.id)) {
        extraCardsWithReferences.push(card);
      }
    }
  }
  response.setHeader("Cache-Control", "no-store");
  response.json({ decks: available.map(({ invalidReasons: _invalidReasons, missingCardDefinitionIds: _missing, requiredCardDefinitionIds: _required, ...deck }) => deck), extraCards: extraCardsWithReferences, extraChampions });
});

export default router;
