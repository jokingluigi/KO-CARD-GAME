/** Server-created composition captured at queue entry, never accepted from HTTP/WS payloads. */
export type FrozenLaunchDeck = {
  deckId: string;
  deckName: string;
  championDefinitionId: string | null;
  cardDefinitionIds: string[];
};
export function withFrozenLaunchDeck<
  T extends {
    id: string;
    name: string;
    championDefinitionId: string | null;
    cardDefinitionIds: string[];
  },
>(owned: T, frozen?: FrozenLaunchDeck): T {
  if (!frozen) return owned;
  if (owned.id !== frozen.deckId)
    throw new Error("확정한 출전 덱과 요청한 덱이 다릅니다.");
  return {
    ...owned,
    name: frozen.deckName,
    championDefinitionId: frozen.championDefinitionId,
    cardDefinitionIds: [...frozen.cardDefinitionIds],
  };
}
