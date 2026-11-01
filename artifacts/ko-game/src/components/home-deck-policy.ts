import type { Deck } from "@/lib/decks-client";
/** Counts physical copies, not unique definitions; never estimates missing card data. */
export function homeDeckSummary(deck: Deck) {
  if (!Array.isArray(deck.cards) || !Array.isArray(deck.cardDefinitionIds))
    return null;
  const lookup = new Map(deck.cards.map((c) => [c.id, c]));
  const cards = deck.cardDefinitionIds.map((id) => lookup.get(id));
  if (!cards.length || cards.some((c) => !c || !Number.isFinite(c.cost)))
    return null;
  const complete = cards as Deck["cards"];
  return {
    average: complete.reduce((n, c) => n + c.cost, 0) / complete.length,
    wrestlers: complete.filter((c) => c.cardType === "WRESTLER").length,
    spells: complete.filter((c) => c.cardType === "TECHNIQUE").length,
  };
}
