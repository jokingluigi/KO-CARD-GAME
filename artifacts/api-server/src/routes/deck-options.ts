export function getVisibleDeckOptionCards<T extends {
  id: string;
  status: string;
  isToken: boolean;
  isChampionToken: boolean;
}>(
  cards: T[],
  ownedCards: Array<{ id: string; quantity: number }>,
  testAccount: boolean,
  unlimitedQuantity: number,
): Array<T & { quantity: number }> {
  const quantityById = new Map(ownedCards.map((card) => [card.id, card.quantity]));
  return cards
    .filter((card) => card.status === "PUBLISHED" && !card.isToken && !card.isChampionToken)
    .map((card) => ({
      ...card,
      quantity: testAccount ? unlimitedQuantity : quantityById.get(card.id) ?? 0,
    }));
}