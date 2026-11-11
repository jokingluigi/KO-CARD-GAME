import { decodeDeck, deckEntityRevision } from "./deck-share-code";
import type { AIDeckOptions } from "./ai-decks-client";
/** Reuses public sharing format; admin AI decks do not depend on personal card ownership. */
export function readSharedAIDeck(code: string, options: AIDeckOptions) {
  const deck = decodeDeck(code),
    champion = options.champions.find((c) => c.id === deck.championId);
  if (!champion || !["PUBLISHED", "DRAFT"].includes(champion.status))
    throw Error("공유 덱의 챔피언이 삭제되었거나 비활성화되어 있습니다.");
  const changed: string[] = [],
    cardDefinitionIds: string[] = [];
  if (
    deckEntityRevision(champion as unknown as Record<string, unknown>) !==
    deck.championRevision
  )
    changed.push(champion.name);
  for (const entry of deck.cards) {
    const card = options.cards.find((c) => c.id === entry.id);
    if (
      !card ||
      !["PUBLISHED", "DRAFT"].includes(card.status) ||
      card.isToken ||
      card.isChampionToken ||
      !["WRESTLER", "TECHNIQUE"].includes(card.cardType)
    )
      throw Error(
        `${card?.name ?? entry.id}: AI 덱에 사용할 수 없는 카드입니다.`,
      );
    cardDefinitionIds.push(...Array(entry.count).fill(entry.id));
    if (
      deckEntityRevision(card as unknown as Record<string, unknown>) !==
      entry.revision
    )
      changed.push(card.name);
  }
  return {
    name: deck.name,
    championDefinitionId: champion.id,
    cardDefinitionIds,
    changed,
  };
}
export function compatibleAISkins(
  ids: string[],
  options: AIDeckOptions,
  championId: string | null,
  cardIds: string[],
) {
  return ids.filter((id) =>
    options.cosmetics?.some(
      (item) =>
        item.id === id &&
        (item.type === "CHAMPION_SKIN"
          ? item.targetId === championId
          : item.type === "CARD_SKIN" && cardIds.includes(item.targetId ?? "")),
    ),
  );
}
