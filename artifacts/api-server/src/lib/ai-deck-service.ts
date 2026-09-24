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
import { DECK_SIZE, MAX_LEGENDARY_CARDS, validateDeckCounts } from "@workspace/game-engine";

export const AI_DECK_MIN_SIZE = DECK_SIZE;
export const AI_DECK_MAX_SIZE = DECK_SIZE;
export const AI_DECK_MAX_CARD_COPIES = 2;
export const AI_DECK_MAX_LEGENDARY_CARDS = MAX_LEGENDARY_CARDS;
export const AI_DECK_ALLOWED_STATUSES = ["PUBLISHED", "DRAFT"] as const;
export const AI_DECK_BLOCKED_STATUSES = ["DISABLED"] as const;
export type DeckValidationContext = "PLAYER_DECK" | "AI_DECK";
export function isAIDefinitionStatusAllowed(status: string): boolean {
  return (AI_DECK_ALLOWED_STATUSES as readonly string[]).includes(status);
}
export function isPublicDefinitionStatus(status: string): boolean {
  return status === "PUBLISHED";
}
export function isDefinitionStatusAllowedForContext(status: string, context: DeckValidationContext): boolean {
  return context === "AI_DECK" ? isAIDefinitionStatusAllowed(status) : isPublicDefinitionStatus(status);
}
export function dependencyValidationReason(
  status: string | null,
  id: string,
  context: DeckValidationContext,
): string | null {
  if (status === null) return "카드 효과 또는 Champion Token 참조를 찾을 수 없습니다.";
  return isDefinitionStatusAllowedForContext(status, context)
    ? null
    : `필수 참조 카드 상태(${status})는 사용할 수 없습니다: ${id}`;
}
export function championTokenReferenceReason(
  card: Pick<CardRecord, "isChampionToken"> | null,
  id: string,
): string | null {
  return card && !card.isChampionToken
    ? `Champion Token 참조가 Champion Token 카드가 아닙니다: ${id}`
    : null;
}

export type AIDeckValidation = {
  isValid: boolean;
  invalidReasons: string[];
  missingCardDefinitionIds: string[];
  champion: ChampionRecord | null;
  cards: CardRecord[];
  requiredCardDefinitionIds: string[];
};

export type AIDeckView = AIDeckRecord & AIDeckValidation;

function cardRuleReasons(cardDefinitionIds: string[], cardsById: Map<string, CardRecord>): string[] {
  const counts = new Map<string, number>();
  cardDefinitionIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  let legendaryCount = 0;
  const legendaryDefinitionCounts: number[] = [];
  const reasons: string[] = [];

  for (const [id, count] of counts) {
    const card = cardsById.get(id);
    if (!card) continue;
    if (card.rarity === "LEGENDARY") {
      legendaryCount += count;
      legendaryDefinitionCounts.push(count);
    } else if (count > AI_DECK_MAX_CARD_COPIES) {
      reasons.push(`같은 카드는 최대 ${AI_DECK_MAX_CARD_COPIES}장까지 넣을 수 있습니다.`);
    }
  }
  for (const reason of validateDeckCounts({
    cardCount: cardDefinitionIds.length,
    legendaryCount,
    legendaryDefinitionCounts,
    championCount: 1,
  })) {
    if (reason === "DUPLICATE_LEGENDARY") reasons.push("레전더리 카드는 같은 카드를 1장만 넣을 수 있습니다.");
    if (reason === "TOO_MANY_LEGENDARIES") reasons.push(`레전더리 카드는 덱에 총 ${AI_DECK_MAX_LEGENDARY_CARDS}장까지만 넣을 수 있습니다.`);
  }
  return reasons;
}

export async function validateAIDeckReferences(
  championDefinitionId: string | null,
  cardDefinitionIds: string[],
  context: DeckValidationContext = "AI_DECK",
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

  const allowedStatuses: readonly string[] = context === "AI_DECK" ? AI_DECK_ALLOWED_STATUSES : ["PUBLISHED"];
  if (!championDefinitionId || !champion) {
    invalidReasons.push(`${context === "AI_DECK" ? "PUBLISHED 또는 DRAFT" : "PUBLISHED"} 상태의 Champion을 1명 선택해야 합니다.`);
  } else if (!allowedStatuses.includes(champion.status as typeof allowedStatuses[number])) {
    invalidReasons.push(`Champion 상태(${champion.status})는 사용할 수 없습니다.`);
  }
  for (const reason of validateDeckCounts({
    cardCount: cardDefinitionIds.length,
    legendaryCount: cardDefinitionIds.reduce(
      (total, id) => total + (cardsById.get(id)?.rarity === "LEGENDARY" ? 1 : 0),
      0,
    ),
    championCount: championDefinitionId ? 1 : 0,
  })) {
    if (reason === "INVALID_CARD_COUNT") invalidReasons.push(`카드는 정확히 ${DECK_SIZE}장이어야 합니다.`);
    if (reason === "TOO_MANY_LEGENDARIES") invalidReasons.push(`레전더리 카드는 덱에 총 ${MAX_LEGENDARY_CARDS}장까지만 넣을 수 있습니다.`);
    if (reason === "INVALID_CHAMPION_COUNT") invalidReasons.push(`${context === "AI_DECK" ? "PUBLISHED 또는 DRAFT" : "PUBLISHED"} 상태의 Champion을 1명 선택해야 합니다.`);
  }

  const missingCardDefinitionIds = uniqueCardIds.filter((id) => !cardsById.has(id));
  if (missingCardDefinitionIds.length > 0) {
    invalidReasons.push("삭제되었거나 존재하지 않는 카드가 포함되어 있습니다.");
  }
  if (cards.some((card) =>
    !allowedStatuses.includes(card.status as typeof allowedStatuses[number]) ||
    card.isToken ||
    card.isChampionToken ||
    !["WRESTLER", "TECHNIQUE"].includes(card.cardType)
  )) {
    invalidReasons.push(`${context === "AI_DECK" ? "PUBLISHED 또는 DRAFT" : "PUBLISHED"} 일반 카드만 덱에 넣을 수 있습니다.`);
  }
  invalidReasons.push(...cardRuleReasons(cardDefinitionIds, cardsById));

  const requiredCardDefinitionIds = new Set<string>();
  const championTokenReferenceIds = new Set<string>();
  const visitReferences = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visitReferences);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.cardDefinitionId === "string") requiredCardDefinitionIds.add(record.cardDefinitionId);
    if (typeof record.championTokenDefinitionId === "string") {
      requiredCardDefinitionIds.add(record.championTokenDefinitionId);
      championTokenReferenceIds.add(record.championTokenDefinitionId);
    }
    Object.values(record).forEach(visitReferences);
  };
  cards.forEach((card) => visitReferences(card.effectConfig));
  if (champion?.championTokenDefinitionId) {
    requiredCardDefinitionIds.add(champion.championTokenDefinitionId);
    championTokenReferenceIds.add(champion.championTokenDefinitionId);
  }
  const missingDependencyIds = new Set<string>();
  const visitedDependencyIds = new Set<string>();
  let pendingDependencyIds = [...requiredCardDefinitionIds].filter((id) => !cardsById.has(id));
  while (pendingDependencyIds.length > 0) {
    pendingDependencyIds = pendingDependencyIds.filter((id) => !visitedDependencyIds.has(id));
    if (pendingDependencyIds.length === 0) break;
    pendingDependencyIds.forEach((id) => visitedDependencyIds.add(id));
    const dependencies = await db.select().from(cardsTable).where(inArray(cardsTable.id, pendingDependencyIds));
    for (const id of pendingDependencyIds) {
      if (!dependencies.some((dependency) => dependency.id === id)) missingDependencyIds.add(id);
    }
    const nextDependencyIds = new Set<string>();
    for (const dependency of dependencies) {
      requiredCardDefinitionIds.add(dependency.id);
      cardsById.set(dependency.id, dependency);
      const dependencyReason = dependencyValidationReason(dependency.status, dependency.id, context);
      if (dependencyReason) invalidReasons.push(dependencyReason);
      visitReferences(dependency.effectConfig);
      for (const id of requiredCardDefinitionIds) {
        if (!cardsById.has(id) && !visitedDependencyIds.has(id)) nextDependencyIds.add(id);
      }
    }
    pendingDependencyIds = [...nextDependencyIds];
  }
  for (const id of requiredCardDefinitionIds) {
    if (!cardsById.has(id)) missingDependencyIds.add(id);
  }
  if (missingDependencyIds.size > 0) {
    invalidReasons.push(`카드 효과 또는 Champion Token 참조를 찾을 수 없습니다: ${[...missingDependencyIds].join(", ")}`);
  }
  for (const id of championTokenReferenceIds) {
    const token = cardsById.get(id);
    if (!token) continue;
    const tokenTypeReason = championTokenReferenceReason(token, id);
    if (tokenTypeReason) invalidReasons.push(tokenTypeReason);
    const tokenReason = dependencyValidationReason(token.status, id, context);
    if (tokenReason) invalidReasons.push(tokenReason);
  }

  return {
    isValid: invalidReasons.length === 0,
    invalidReasons: [...new Set(invalidReasons)],
    missingCardDefinitionIds: [...new Set([...missingCardDefinitionIds, ...uniqueCardIds.filter((id) => !cardsById.has(id))])],
    champion: champion ?? null,
    cards: cardDefinitionIds
      .map((id) => cardsById.get(id))
      .filter((card): card is CardRecord => Boolean(card)),
    requiredCardDefinitionIds: [...requiredCardDefinitionIds],
  };
}

export async function resolveAIDeck(
  deck: AIDeckRecord,
  context: DeckValidationContext = "AI_DECK",
): Promise<AIDeckView> {
  const validation = await validateAIDeckReferences(deck.championDefinitionId, deck.cardDefinitionIds, context);
  return { ...deck, ...validation };
}

export async function listAIDecks(options?: { enabledOnly?: boolean; context?: DeckValidationContext }): Promise<AIDeckView[]> {
  const decks = await db
    .select()
    .from(aiDecksTable)
    .where(options?.enabledOnly ? eq(aiDecksTable.enabled, true) : undefined)
    .orderBy(asc(aiDecksTable.displayOrder), asc(aiDecksTable.name));
  return Promise.all(decks.map((deck) => resolveAIDeck(deck, options?.context)));
}