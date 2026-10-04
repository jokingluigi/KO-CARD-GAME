import type { CardDefinition } from "../game/cards/types";
export type MatchCardCatalog = { cardPool?: CardDefinition[]; minionACardPool?: CardDefinition[] };
// Only account-authorized cards and definitions already supplied by this match.
export function mergeOnlineCardCatalog(account: CardDefinition[], match?: MatchCardCatalog): CardDefinition[] {
  return [...new Map([...account, ...(match?.minionACardPool ?? []), ...(match?.cardPool ?? [])]
    .map(card => [card.id, card])).values()];
}
