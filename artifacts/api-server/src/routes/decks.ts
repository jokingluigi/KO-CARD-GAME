import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  cardsTable,
  championsTable,
  db,
  decksTable,
  userCardCollectionsTable,
  userChampionCollectionsTable,
  type CardRecord,
  type ChampionRecord,
  type DeckRecord,
} from "@workspace/db";
import { DECK_SIZE, MAX_LEGENDARY_CARDS, validateDeckCounts } from "@workspace/game-engine";
import { getAuthenticatedUser } from "../lib/auth";
import {
  isEligibleTestCard,
  isTestAccountUser,
  TEST_ACCOUNT_UNLIMITED_QUANTITY,
} from "../lib/test-account";

const router: IRouter = Router();
const MAX_NAME_LENGTH = 30;
const MAX_CARD_COPIES = 2;
const VALID_CARD_TYPES = new Set(["WRESTLER", "TECHNIQUE"]);
type CardRuleRecord = Pick<CardRecord, "id" | "rarity">;

type DeckPayload = {
  name: string;
  championDefinitionId: string | null;
  cardDefinitionIds: string[];
};

export type DeckValidationReason = {
  scope: "DECK" | "CARD";
  reasonCode: string;
  message: string;
  cardDefinitionIds?: string[];
  count?: number;
  limit?: number;
};

type ResolvedDeck = DeckRecord & {
  champion: ChampionRecord | null;
  cards: CardRecord[];
  missingCardDefinitionIds: string[];
  isValid: boolean;
  invalidReasons: string[];
  validationReasons: DeckValidationReason[];
};

function uniqueReasons(reasons: DeckValidationReason[]): DeckValidationReason[] {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    const key = `${reason.reasonCode}:${reason.message}:${(reason.cardDefinitionIds ?? []).join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getCardRuleReasons(cardDefinitionIds: string[], cardsById: Map<string, CardRuleRecord>): DeckValidationReason[] {
  const counts = new Map<string, number>();
  cardDefinitionIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  const reasons: DeckValidationReason[] = [];
  let legendaryCount = 0;
  const legendaryDefinitionCounts: number[] = [];
  const legendaryIds: string[] = [];

  counts.forEach((count, id) => {
    const card = cardsById.get(id);
    if (!card) return;
    if (card.rarity === "LEGENDARY") {
      legendaryCount += count;
      legendaryDefinitionCounts.push(count);
      legendaryIds.push(id);
    } else if (count > MAX_CARD_COPIES) {
      reasons.push({
        scope: "CARD",
        reasonCode: "DUPLICATE_CARD",
        message: `같은 카드는 최대 ${MAX_CARD_COPIES}장까지 넣을 수 있습니다.`,
        cardDefinitionIds: [id],
        count,
        limit: MAX_CARD_COPIES,
      });
    }
  });

  for (const reason of validateDeckCounts({
    cardCount: cardDefinitionIds.length,
    legendaryCount,
    legendaryDefinitionCounts,
    championCount: 1,
  })) {
    if (reason === "DUPLICATE_LEGENDARY") {
      counts.forEach((count, id) => {
        if (cardsById.get(id)?.rarity === "LEGENDARY" && count > 1) {
          reasons.push({
            scope: "CARD",
            reasonCode: "DUPLICATE_LEGENDARY",
            message: "레전더리 카드는 같은 카드를 1장만 넣을 수 있습니다.",
            cardDefinitionIds: [id],
            count,
            limit: 1,
          });
        }
      });
    }
    if (reason === "TOO_MANY_LEGENDARIES") reasons.push({
      scope: "CARD",
      reasonCode: "LEGENDARY_LIMIT_EXCEEDED",
      message: `레전더리 카드는 덱에 총 ${MAX_LEGENDARY_CARDS}장까지만 넣을 수 있습니다.`,
      cardDefinitionIds: legendaryIds,
      count: legendaryCount,
      limit: MAX_LEGENDARY_CARDS,
    });
  }
  return uniqueReasons(reasons);
}

function requireUser(request: Request, response: Response): NonNullable<Request["authUser"]> | null {
  if (request.authUser) return request.authUser;
  response.status(401).json({ message: "로그인이 필요합니다." });
  return null;
}

export async function loadUserDeck(userId: string, deckId: string): Promise<DeckRecord | null> {
  const [deck] = await db
    .select()
    .from(decksTable)
    .where(and(eq(decksTable.id, deckId), eq(decksTable.userId, userId)))
    .limit(1);
  return deck ?? null;
}

export async function resolveDeck(deck: DeckRecord, userId: string, testAccount = false): Promise<ResolvedDeck> {
  const [champion] = deck.championDefinitionId
    ? await db
        .select()
        .from(championsTable)
        .where(eq(championsTable.id, deck.championDefinitionId))
        .limit(1)
    : [undefined];

  const uniqueCardIds = [...new Set(deck.cardDefinitionIds)];
  const cards = uniqueCardIds.length
    ? await db
        .select()
        .from(cardsTable)
        .where(inArray(cardsTable.id, uniqueCardIds))
    : [];
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const [ownedCardRows, ownedChampionRows] = await Promise.all([
    uniqueCardIds.length
      ? db.select({ id: userCardCollectionsTable.cardDefinitionId, quantity: userCardCollectionsTable.quantity })
        .from(userCardCollectionsTable)
        .where(and(eq(userCardCollectionsTable.userId, userId), inArray(userCardCollectionsTable.cardDefinitionId, uniqueCardIds), sql`${userCardCollectionsTable.quantity} > 0`))
      : [],
    champion
      ? db.select({ id: userChampionCollectionsTable.championDefinitionId })
        .from(userChampionCollectionsTable)
        .where(and(eq(userChampionCollectionsTable.userId, userId), eq(userChampionCollectionsTable.championDefinitionId, champion.id), eq(userChampionCollectionsTable.owned, true)))
      : [],
  ]);
  const ownedCardIds = new Set(ownedCardRows.map((row) => row.id));
  const ownedCardQuantities = new Map(ownedCardRows.map((row) => [row.id, row.quantity]));
  if (testAccount) {
    cards.filter(isEligibleTestCard).forEach((card) => {
      ownedCardIds.add(card.id);
      ownedCardQuantities.set(card.id, TEST_ACCOUNT_UNLIMITED_QUANTITY);
    });
  }
  const missingCardDefinitionIds = uniqueCardIds.filter((id) => !cardById.has(id));
  const validationReasons: DeckValidationReason[] = [];

  if (!champion) {
    validationReasons.push({ scope: "DECK", reasonCode: "CHAMPION_UNAVAILABLE", message: "사용할 수 없는 Champion이 포함되어 있습니다." });
  } else if (champion.status !== "PUBLISHED") {
    validationReasons.push({ scope: "DECK", reasonCode: "CHAMPION_UNAVAILABLE", message: "사용할 수 없는 Champion이 포함되어 있습니다." });
  } else if (ownedChampionRows.length === 0 && !testAccount) {
    validationReasons.push({ scope: "DECK", reasonCode: "CHAMPION_NOT_OWNED", message: "소유하지 않은 Champion이 포함되어 있습니다." });
  }
  for (const reason of validateDeckCounts({
    cardCount: deck.cardDefinitionIds.length,
    legendaryCount: deck.cardDefinitionIds.reduce(
      (total, id) => total + (cardById.get(id)?.rarity === "LEGENDARY" ? 1 : 0),
      0,
    ),
    championCount: deck.championDefinitionId ? 1 : 0,
  })) {
    if (reason === "INVALID_CARD_COUNT") validationReasons.push({
      scope: "DECK",
      reasonCode: "CARD_COUNT_INVALID",
      message: `카드는 정확히 ${DECK_SIZE}장이어야 합니다.`,
      count: deck.cardDefinitionIds.length,
      limit: DECK_SIZE,
    });
    if (reason === "TOO_MANY_LEGENDARIES") {
      const ids = uniqueCardIds.filter((id) => cardById.get(id)?.rarity === "LEGENDARY");
      validationReasons.push({
        scope: "CARD",
        reasonCode: "LEGENDARY_LIMIT_EXCEEDED",
        message: `레전더리 카드는 덱에 총 ${MAX_LEGENDARY_CARDS}장까지만 넣을 수 있습니다.`,
        cardDefinitionIds: ids,
        count: deck.cardDefinitionIds.filter((id) => cardById.get(id)?.rarity === "LEGENDARY").length,
        limit: MAX_LEGENDARY_CARDS,
      });
    }
    if (reason === "INVALID_CHAMPION_COUNT" && !champion) validationReasons.push({
      scope: "DECK",
      reasonCode: "CHAMPION_REQUIRED",
      message: "사용할 수 있는 Champion을 정확히 1명 선택해야 합니다.",
      count: deck.championDefinitionId ? 1 : 0,
      limit: 1,
    });
  }
  if (missingCardDefinitionIds.length > 0) {
    validationReasons.push({
      scope: "CARD",
      reasonCode: "CARD_DEFINITION_MISSING",
      message: "삭제되었거나 존재하지 않는 카드가 포함되어 있습니다.",
      cardDefinitionIds: missingCardDefinitionIds,
    });
  }
  const tokenIds = cards.filter((card) => card.isToken || card.isChampionToken).map((card) => card.id);
  if (tokenIds.length > 0) {
    validationReasons.push({
      scope: "CARD",
      reasonCode: "TOKEN_CARD_NOT_ALLOWED",
      message: "Token 카드는 덱에 직접 편성할 수 없습니다.",
      cardDefinitionIds: tokenIds,
    });
  }
  const unavailableCardIds = cards.filter((card) =>
    card.status !== "PUBLISHED" ||
    !VALID_CARD_TYPES.has(card.cardType),
  ).map((card) => card.id);
  if (unavailableCardIds.length > 0) {
    validationReasons.push({
      scope: "CARD",
      reasonCode: "CARD_NOT_PLAYABLE",
      message: "공개된 일반 카드만 덱에 넣을 수 있습니다.",
      cardDefinitionIds: unavailableCardIds,
    });
  }
  validationReasons.push(...getCardRuleReasons(deck.cardDefinitionIds, cardById));
  const unownedCardIds = uniqueCardIds.filter((id) => !ownedCardIds.has(id));
  if (unownedCardIds.length > 0) {
    validationReasons.push({
      scope: "CARD",
      reasonCode: "CARD_NOT_OWNED",
      message: "소유하지 않은 카드가 포함되어 있습니다.",
      cardDefinitionIds: unownedCardIds,
    });
  }
  const cardCopies = new Map<string, number>();
  deck.cardDefinitionIds.forEach((id) => cardCopies.set(id, (cardCopies.get(id) ?? 0) + 1));
  const overOwnedCardIds = [...cardCopies]
    .filter(([id, count]) => (ownedCardQuantities.get(id) ?? 0) < count)
    .map(([id]) => id);
  if (overOwnedCardIds.length > 0) {
    validationReasons.push({
      scope: "CARD",
      reasonCode: "CARD_QUANTITY_EXCEEDED",
      message: "현재 보유 수량보다 많은 카드가 덱에 포함되어 있습니다.",
      cardDefinitionIds: overOwnedCardIds,
    });
  }
  const uniqueValidationReasons = uniqueReasons(validationReasons);

  const orderedCards = deck.cardDefinitionIds
    .map((id) => cardById.get(id))
    .filter((card): card is CardRecord => Boolean(card));

  return {
    ...deck,
    champion: champion ?? null,
    cards: orderedCards,
    missingCardDefinitionIds,
    isValid: uniqueValidationReasons.length === 0,
    invalidReasons: uniqueValidationReasons.map((reason) => reason.message),
    validationReasons: uniqueValidationReasons,
  };
}

async function parseDeckPayload(value: unknown): Promise<
  | { ok: true; payload: DeckPayload }
  | { ok: false; message: string }
> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "덱 정보를 확인해 주세요." };
  }
  const body = value as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const championDefinitionId =
    body.championDefinitionId === null || body.championDefinitionId === undefined
      ? null
      : typeof body.championDefinitionId === "string" && body.championDefinitionId.trim()
        ? body.championDefinitionId.trim()
        : null;
  const cardDefinitionIds = body.cardDefinitionIds;
  if (Array.from(name).length < 1 || Array.from(name).length > MAX_NAME_LENGTH) {
    return { ok: false, message: `덱 이름은 1~${MAX_NAME_LENGTH}자로 입력해 주세요.` };
  }
  if (
    !Array.isArray(cardDefinitionIds) ||
    cardDefinitionIds.some((id) => typeof id !== "string" || !id.trim())
  ) {
    return { ok: false, message: "카드 목록을 확인해 주세요." };
  }
  return {
    ok: true,
    payload: {
      name,
      championDefinitionId,
      cardDefinitionIds: cardDefinitionIds.map((id) => (id as string).trim()),
    },
  };
}

async function validateReferences(payload: DeckPayload, userId: string, testAccount = false): Promise<string | null> {
  if (payload.championDefinitionId) {
    const [champion] = await db
      .select({ id: championsTable.id, status: championsTable.status })
      .from(championsTable)
      .where(eq(championsTable.id, payload.championDefinitionId))
      .limit(1);
    if (!champion || champion.status !== "PUBLISHED") {
      return "PUBLISHED 상태의 Champion만 선택할 수 있습니다.";
    }
    const [ownedChampion] = await db.select({ id: userChampionCollectionsTable.championDefinitionId })
      .from(userChampionCollectionsTable)
      .where(and(eq(userChampionCollectionsTable.userId, userId), eq(userChampionCollectionsTable.championDefinitionId, champion.id), eq(userChampionCollectionsTable.owned, true)));
    if (!ownedChampion && !testAccount) return "소유한 Champion만 선택할 수 있습니다.";
  }
  const uniqueCardIds = [...new Set(payload.cardDefinitionIds)];
  if (uniqueCardIds.length === 0) return null;
  const cards = await db
    .select({
      id: cardsTable.id,
      cardType: cardsTable.cardType,
      isToken: cardsTable.isToken,
      isChampionToken: cardsTable.isChampionToken,
      status: cardsTable.status,
      rarity: cardsTable.rarity,
    })
    .from(cardsTable)
    .where(inArray(cardsTable.id, uniqueCardIds));
  if (
    cards.length !== uniqueCardIds.length ||
    cards.some((card) =>
      card.status !== "PUBLISHED" ||
      card.isToken ||
      card.isChampionToken ||
      !VALID_CARD_TYPES.has(card.cardType)
    )
  ) {
    return "PUBLISHED 일반 카드만 덱에 넣을 수 있습니다.";
  }
  const ownedCards = await db.select({
    id: userCardCollectionsTable.cardDefinitionId,
    quantity: userCardCollectionsTable.quantity,
  })
    .from(userCardCollectionsTable)
    .where(and(eq(userCardCollectionsTable.userId, userId), inArray(userCardCollectionsTable.cardDefinitionId, uniqueCardIds), sql`${userCardCollectionsTable.quantity} > 0`));
  if (
    !testAccount &&
    ownedCards.length !== uniqueCardIds.length
  ) return "소유한 카드만 덱에 넣을 수 있습니다.";
  if (!testAccount) {
    const ownedQuantities = new Map(ownedCards.map((card) => [card.id, card.quantity]));
    const cardCopies = new Map<string, number>();
    payload.cardDefinitionIds.forEach((id) => {
      cardCopies.set(id, (cardCopies.get(id) ?? 0) + 1);
    });
    if ([...cardCopies].some(([id, count]) => count > (ownedQuantities.get(id) ?? 0))) {
      return "현재 보유 수량보다 많은 카드는 덱에 넣을 수 없습니다.";
    }
  }
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const ruleReasons = getCardRuleReasons(payload.cardDefinitionIds, cardById);
  if (ruleReasons.length > 0) return ruleReasons.join(" ");
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
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/", async (request, response): Promise<void> => {
  const user = requireUser(request, response);
  if (!user) return;
  const decks = await db
    .select()
    .from(decksTable)
    .where(eq(decksTable.userId, user.id))
    .orderBy(asc(decksTable.createdAt));
  response.setHeader("Cache-Control", "no-store");
  response.json({ decks: await Promise.all(decks.map((deck) => resolveDeck(deck, user.id, isTestAccountUser(user)))) });
});

router.get("/options", async (request, response): Promise<void> => {
  const user = requireUser(request, response);
  if (!user) return;
  const [cards, champions] = await Promise.all([
    db
      .select()
      .from(cardsTable)
      .where(and(
        eq(cardsTable.status, "PUBLISHED"),
        eq(cardsTable.isToken, false),
        eq(cardsTable.isChampionToken, false),
      ))
      .orderBy(asc(cardsTable.cost), asc(cardsTable.name)),
    db
      .select()
      .from(championsTable)
      .where(eq(championsTable.status, "PUBLISHED"))
      .orderBy(asc(championsTable.name)),
  ]);
  const [ownedCards, ownedChampions] = await Promise.all([
    db.select({ id: userCardCollectionsTable.cardDefinitionId, quantity: userCardCollectionsTable.quantity })
      .from(userCardCollectionsTable)
      .where(and(eq(userCardCollectionsTable.userId, user.id), sql`${userCardCollectionsTable.quantity} > 0`)),
    db.select({ id: userChampionCollectionsTable.championDefinitionId })
      .from(userChampionCollectionsTable)
      .where(and(eq(userChampionCollectionsTable.userId, user.id), eq(userChampionCollectionsTable.owned, true))),
  ]);
  const ownedCardIds = new Set(ownedCards.map((card) => card.id));
  const ownedChampionIds = new Set(ownedChampions.map((champion) => champion.id));
  response.setHeader("Cache-Control", "no-store");
  const testAccount = isTestAccountUser(user);
  const visibleCards = testAccount ? cards : cards.filter((card) => ownedCardIds.has(card.id));
  const visibleChampions = testAccount ? champions : champions.filter((champion) => ownedChampionIds.has(champion.id));
  response.json({
    isTestAccount: testAccount,
    cards: visibleCards.map((card) => ({
      ...card,
      quantity: testAccount ? TEST_ACCOUNT_UNLIMITED_QUANTITY : ownedCards.find((owned) => owned.id === card.id)?.quantity ?? 0,
    })),
    champions: visibleChampions,
  });
});

router.post("/", async (request, response): Promise<void> => {
  const user = requireUser(request, response);
  if (!user) return;
  const parsed = await parseDeckPayload(request.body);
  if (!parsed.ok) {
    response.status(400).json({ message: parsed.message });
    return;
  }
  const referenceError = await validateReferences(parsed.payload, user.id, isTestAccountUser(user));
  if (referenceError) {
    response.status(400).json({ message: referenceError });
    return;
  }
  const [deck] = await db
    .insert(decksTable)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      ...parsed.payload,
    })
    .returning();
  response.status(201).json({ deck: deck ? await resolveDeck(deck, user.id, isTestAccountUser(user)) : null });
});

router.patch("/:id", async (request, response): Promise<void> => {
  const user = requireUser(request, response);
  if (!user) return;
  const existing = await loadUserDeck(user.id, request.params.id);
  if (!existing) {
    response.status(404).json({ message: "덱을 찾을 수 없습니다." });
    return;
  }
  const parsed = await parseDeckPayload(request.body);
  if (!parsed.ok) {
    response.status(400).json({ message: parsed.message });
    return;
  }
  const referenceError = await validateReferences(parsed.payload, user.id, isTestAccountUser(user));
  if (referenceError) {
    response.status(400).json({ message: referenceError });
    return;
  }
  const [deck] = await db
    .update(decksTable)
    .set({ ...parsed.payload, updatedAt: new Date() })
    .where(and(eq(decksTable.id, existing.id), eq(decksTable.userId, user.id)))
    .returning();
  response.json({ deck: deck ? await resolveDeck(deck, user.id, isTestAccountUser(user)) : null });
});

router.post("/:id/select", async (request, response): Promise<void> => {
  const user = requireUser(request, response);
  if (!user) return;
  const existing = await loadUserDeck(user.id, request.params.id);
  if (!existing) {
    response.status(404).json({ message: "덱을 찾을 수 없습니다." });
    return;
  }
  const resolved = await resolveDeck(existing, user.id, isTestAccountUser(user));
  if (!resolved.isValid) {
    response.status(400).json({ message: "미완성 또는 사용할 수 없는 덱은 대표 덱으로 설정할 수 없습니다." });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(decksTable)
      .set({ isSelected: false, updatedAt: new Date() })
      .where(eq(decksTable.userId, user.id));
    await tx
      .update(decksTable)
      .set({ isSelected: true, updatedAt: new Date() })
      .where(and(eq(decksTable.id, existing.id), eq(decksTable.userId, user.id)));
  });
  const [deck] = await db
    .select()
    .from(decksTable)
    .where(eq(decksTable.id, existing.id))
    .limit(1);
  response.json({ deck: deck ? await resolveDeck(deck, user.id) : null });
});

router.delete("/:id", async (request, response): Promise<void> => {
  const user = requireUser(request, response);
  if (!user) return;
  const deleted = await db
    .delete(decksTable)
    .where(and(eq(decksTable.id, request.params.id), eq(decksTable.userId, user.id)))
    .returning({ id: decksTable.id });
  if (deleted.length === 0) {
    response.status(404).json({ message: "덱을 찾을 수 없습니다." });
    return;
  }
  response.json({ deleted: true });
});

export default router;