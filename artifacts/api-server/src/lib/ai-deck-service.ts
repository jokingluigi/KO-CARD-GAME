import { and, asc, eq, inArray } from "drizzle-orm";
import {
  aiDecksTable,
  cardsTable,
  championsTable,
  db,
  type AIDeckRecord,
  type CardRecord,
  type ChampionRecord,
} from "@workspace/db";

export const AI_DECK_MIN_SIZE = 20;
export const AI_DECK_MAX_SIZE = 30;
export const AI_DECK_MAX_CARD_COPIES = 2;
export const AI_DECK_MAX_LEGENDARY_CARDS = 3;

export type AIDeckValidation = {
  isValid: boolean;
  invalidReasons: string[];
  missingCardDefinitionIds: string[];
  champion: ChampionRecord | null;
  cards: CardRecord[];
};

export type AIDeckView = AIDeckRecord & AIDeckValidation;

function cardRuleReasons(cardDefinitionIds: string[], cardsById: Map<string, CardRecord>): string[] {
  const counts = new Map<string, number>();
  cardDefinitionIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  let legendaryCount = 0;
  const reasons: string[] = [];

  for (const [id, count] of counts) {
    const card = cardsById.get(id);
    if (!card) continue;
    if (card.rarity === "LEGENDARY") {
      legendaryCount += count;
      if (count > 1) reasons.push("레전더리 카드는 같은 카드를 1장만 넣을 수 있습니다.");
    } else if (count > AI_DECK_MAX_CARD_COPIES) {
      reasons.push(`같은 카드는 최대 ${AI_DECK_MAX_CARD_COPIES}장까지 넣을 수 있습니다.`);
    }
  }
  if (legendaryCount > AI_DECK_MAX_LEGENDARY_CARDS) {
    reasons.push(`레전더리 카드는 덱에 총 ${AI_DECK_MAX_LEGENDARY_CARDS}장까지만 넣을 수 있습니다.`);
  }
  return reasons;
}

export async function validateAIDeckReferences(
  championDefinitionId: string | null,
  cardDefinitionIds: string[],
): Promise<AIDeckValidation> {
  const uniqueCardIds = [...new Set(cardDefinitionIds)];
  const [champion] = championDefinitionId
    ? await db.select().from(championsTable).where(eq(championsTable.id, championDefinitionId)).limit(1)
    : [undefined];
  const cards = uniqueCardIds.length
    ? await db.select().from(cardsTable).where(inArray(cardsTable.id, uniqueCardIds))
    : [];
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const invalidReasons: string[] = [];

  if (!championDefinitionId || !champion) {
    invalidReasons.push("PUBLISHED 상태의 Champion을 1명 선택해야 합니다.");
  } else if (champion.status !== "PUBLISHED") {
    invalidReasons.push("Champion이 더 이상 PUBLISHED 상태가 아닙니다.");
  }
  if (cardDefinitionIds.length < AI_DECK_MIN_SIZE) {
    invalidReasons.push(`카드가 ${AI_DECK_MIN_SIZE}장보다 적습니다.`);
  }
  if (cardDefinitionIds.length > AI_DECK_MAX_SIZE) {
    invalidReasons.push(`카드가 ${AI_DECK_MAX_SIZE}장을 초과했습니다.`);
  }

  const missingCardDefinitionIds = uniqueCardIds.filter((id) => !cardsById.has(id));
  if (missingCardDefinitionIds.length > 0) {
    invalidReasons.push("삭제되었거나 존재하지 않는 카드가 포함되어 있습니다.");
  }
  if (cards.some((card) =>
    card.status !== "PUBLISHED" ||
    card.isToken ||
    card.isChampionToken ||
    !["WRESTLER", "TECHNIQUE"].includes(card.cardType)
  )) {
    invalidReasons.push("PUBLISHED 일반 카드만 AI 덱에 넣을 수 있습니다.");
  }
  invalidReasons.push(...cardRuleReasons(cardDefinitionIds, cardsById));

  return {
    isValid: invalidReasons.length === 0,
    invalidReasons: [...new Set(invalidReasons)],
    missingCardDefinitionIds,
    champion: champion ?? null,
    cards: cardDefinitionIds
      .map((id) => cardsById.get(id))
      .filter((card): card is CardRecord => Boolean(card)),
  };
}

export async function resolveAIDeck(deck: AIDeckRecord): Promise<AIDeckView> {
  const validation = await validateAIDeckReferences(deck.championDefinitionId, deck.cardDefinitionIds);
  return { ...deck, ...validation };
}

export async function listAIDecks(options?: { enabledOnly?: boolean }): Promise<AIDeckView[]> {
  const decks = await db
    .select()
    .from(aiDecksTable)
    .where(options?.enabledOnly ? eq(aiDecksTable.enabled, true) : undefined)
    .orderBy(asc(aiDecksTable.displayOrder), asc(aiDecksTable.name));
  return Promise.all(decks.map(resolveAIDeck));
}