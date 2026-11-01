import type { Deck } from "./decks-client";
/** Never silently substitute another deck for an unset, deleted or invalid selection. */
export function resolveLaunchDeck(
  decks: Deck[],
  explicitId?: string | null,
): { deck: Deck | null; reason: string | null } {
  const matches = explicitId
    ? decks.filter((d) => d.id === explicitId)
    : decks.filter((d) => d.isSelected);
  if (matches.length !== 1)
    return {
      deck: null,
      reason: explicitId
        ? "이전 출전 덱이 삭제됐거나 찾을 수 없어요. 덱 편집기에서 출전 덱을 지정하세요."
        : matches.length > 1
          ? "출전 덱을 하나만 다시 지정해 주세요."
          : "출전 덱이 없어요. 덱 편집기에서 사용할 덱을 지정하세요.",
    };
  const deck = matches[0];
  if (!deck.isValid || !deck.championDefinitionId)
    return {
      deck,
      reason:
        deck.invalidReasons?.join(" ") ||
        "출전 덱을 사용할 수 없어요. 덱 구성을 확인하세요.",
    };
  return { deck, reason: null };
}
export const launchDeckEditor = (id?: string | null) =>
  `/decks${id ? "?edit=" + encodeURIComponent(id) : ""}`;
