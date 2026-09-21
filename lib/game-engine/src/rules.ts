/** Canonical constructed-deck rules shared by the client, API, and match engine. */
export const DECK_SIZE = 25 as const;
export const MAX_LEGENDARY_CARDS = 5 as const;

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