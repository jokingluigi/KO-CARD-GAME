import type { DeckCard } from "@/lib/decks-client";

import { maxCardCopies, cardCopyLimitMessage } from "@workspace/game-engine/rules";
export const MAX_CARD_COPIES = maxCardCopies("NORMAL");

export type DeckCardCountView = {
  ownedCount: number | undefined;
  deckCount: number;
  availableToAdd: number | undefined;
};

/**
 * Keep the immutable collection quantity separate from the editable deck draft.
 * An absent quantity means the card source does not expose an ownership limit
 * (for example, an AI deck), so availability is likewise left undefined.
 */
export function getDeckCardCountView(card: DeckCard, deckCount: number): DeckCardCountView {
  const ownedCount = card.quantity;
  return {
    ownedCount,
    deckCount,
    availableToAdd: ownedCount === undefined ? undefined : Math.max(0, ownedCount - deckCount),
  };
}

export function cardLimitReason(
  card: DeckCard,
  count: number,
  legendaryCount: number,
  maxLegendaryCards: number,
): string | undefined {
  if (card.rarity === "LEGENDARY") {
    if (count >= 1) return "레전더리 동일 카드 1장 제한";
    if (legendaryCount >= maxLegendaryCards) return `레전더리 총 ${maxLegendaryCards}장 제한`;
  } else if (count >= maxCardCopies(card.rarity)) {
    return cardCopyLimitMessage(card.rarity);
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
    isAdmin = false,
  }: {
    count: number;
    deckCount: number;
    deckSize: number;
    legendaryCount: number;
    maxLegendaryCards: number;
    isTestAccount: boolean;
    isAdmin?: boolean;
  },
): DeckCardAction {
  if ((card.status !== "PUBLISHED" && !(card.status === "DRAFT" && (isAdmin || (card.quantity ?? 0) > 0))) || card.isToken || card.isChampionToken) {
    return { kind: "DISABLED", reason: "공개된 일반 카드만 덱에 넣을 수 있습니다." };
  }
  if (!isTestAccount && card.quantity === 0) return { kind: "CRAFT" };

  const limit = cardLimitReason(card, count, legendaryCount, maxLegendaryCards) ?? (deckCount >= deckSize ? `덱은 정확히 ${deckSize}장까지 구성할 수 있습니다.` : undefined);
  if (!limit && card.status === "PUBLISHED" && !isTestAccount && card.quantity !== undefined && count >= card.quantity && card.quantity < maxCardCopies(card.rarity)) return { kind: "CRAFT" };
  const reason =
    limit ??
    cardOwnershipReason(card, count, isTestAccount) ??
    (deckCount >= deckSize ? `덱은 정확히 ${deckSize}장까지 구성할 수 있습니다.` : undefined);
  return reason ? { kind: "DISABLED", reason } : { kind: "ADD" };
}
