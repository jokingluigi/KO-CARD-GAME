/** Canonical constructed-deck rules shared by the client, API, and match engine. */
export const DECK_SIZE = 25 as const;
export const MAX_LEGENDARY_CARDS = 3 as const;

/** One match turn contains both players' consecutive action turns. */
export function matchTurnNumber(actionTurn: number): number {
  return Math.max(1, Math.ceil(actionTurn / 2));
}

export function validateDeckCounts(input: {
  cardCount: number;
  legendaryCount: number;
  championCount: number;
  legendaryDefinitionCounts?: readonly number[];
}): string[] {
  const reasons: string[] = [];
  if (input.cardCount !== DECK_SIZE) reasons.push("INVALID_CARD_COUNT");
  if (input.legendaryCount > MAX_LEGENDARY_CARDS) reasons.push("TOO_MANY_LEGENDARIES");
  if (input.legendaryDefinitionCounts?.some((count) => count > 1)) {
    reasons.push("DUPLICATE_LEGENDARY");
  }
  if (input.championCount !== 1) reasons.push("INVALID_CHAMPION_COUNT");
  return reasons;
}
export const MAX_COPIES_BY_RARITY = { NORMAL: 3, EPIC: 2, LEGENDARY: 1 } as const;
export function maxCardCopies(rarity: string | undefined): number {
  return rarity === 'EPIC' ? MAX_COPIES_BY_RARITY.EPIC : rarity === 'LEGENDARY' ? MAX_COPIES_BY_RARITY.LEGENDARY : MAX_COPIES_BY_RARITY.NORMAL;
}
export function cardCopyLimitMessage(rarity: string | undefined): string {
  const label = rarity === 'EPIC' ? '에픽' : rarity === 'LEGENDARY' ? '레전더리' : '노멀';
  return `${label} 카드는 동일 카드 최대 ${maxCardCopies(rarity)}장까지 넣을 수 있습니다.`;
}
