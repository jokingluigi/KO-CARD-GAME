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
  admin = false,
): Array<T & { quantity: number }> {
  const quantityById = new Map(ownedCards.map((card) => [card.id, card.quantity]));
  return cards
    .filter((card) => (card.status === "PUBLISHED" || card.status === "DRAFT" && (admin || (quantityById.get(card.id) ?? 0) > 0)) && !card.isToken && !card.isChampionToken)
    .map((card) => ({
      ...card,
      quantity: testAccount && (card.status === "PUBLISHED" || admin) ? unlimitedQuantity : quantityById.get(card.id) ?? 0,
    }));
}