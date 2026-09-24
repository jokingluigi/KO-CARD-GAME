import type { DeckCard } from "@/lib/decks-client";

export const MAX_CARD_COPIES = 2;

export function cardLimitReason(
  card: DeckCard,
  count: number,
  legendaryCount: number,
  maxLegendaryCards: number,
): string | undefined {
  if (card.rarity === "LEGENDARY") {
    if (count >= 1) return "레전더리 동일 카드 1장 제한";
    if (legendaryCount >= maxLegendaryCards) return `레전더리 총 ${maxLegendaryCards}장 제한`;
  } else if (count >= MAX_CARD_COPIES) {
    return "동일 카드 최대 2장";
  }
  return undefined;
}

export function cardOwnershipReason(card: DeckCard, count: number, isTestAccount: boolean): string | undefined {
  if (!isTestAccount && card.quantity !== undefined && count >= card.quantity) {
    return `보유 수량 ${card.quantity}장에 도달했습니다.`;
  }
  return undefined;
}

export type DeckCardAction =
  | { kind: "CRAFT" }
  | { kind: "ADD" }
  | { kind: "DISABLED"; reason?: string };

export function getDeckCardAction(
  card: DeckCard,
  {
    count,
    deckCount,
    deckSize,
    legendaryCount,
    maxLegendaryCards,
    isTestAccount,
  }: {
    count: number;
    deckCount: number;
    deckSize: number;
    legendaryCount: number;
    maxLegendaryCards: number;
    isTestAccount: boolean;
  },
): DeckCardAction {
  if (card.status !== "PUBLISHED" || card.isToken || card.isChampionToken) {
    return { kind: "DISABLED", reason: "공개된 일반 카드만 덱에 넣을 수 있습니다." };
  }
  if (!isTestAccount && card.quantity === 0) return { kind: "CRAFT" };

  const reason =
    cardLimitReason(card, count, legendaryCount, maxLegendaryCards) ??
    cardOwnershipReason(card, count, isTestAccount) ??
    (deckCount >= deckSize ? `덱은 정확히 ${deckSize}장까지 구성할 수 있습니다.` : undefined);
  return reason ? { kind: "DISABLED", reason } : { kind: "ADD" };
}