import type { CardInstance, GameState } from "@/game";
/** Explains observable prerequisites only. Existing engine remains the authority. */
export function handUnavailableReason(
  state: GameState,
  card: CardInstance,
  payable: number,
  towerAllowed = true,
): string | null {
  const me = state.players[0];
  if (state.status !== "IN_PROGRESS") return "지금은 카드를 사용할 수 없어요.";
  if (state.activePlayerId !== me.id) return "내 턴에 사용할 수 있어요.";
  if (state.targetingState?.active)
    return "먼저 강조된 대상을 선택하거나 선택을 취소하세요.";
  if (me.currentGold < payable)
    return `골드가 ${payable - me.currentGold} 부족해요. 필요 ${payable} · 보유 ${me.currentGold}`;
  if (card.cardType === "WRESTLER" && !towerAllowed)
    return "현재 타워의 필드 진입 조건을 충족하지 못했어요.";
  if (card.cardType === "WRESTLER" && me.board.every(Boolean))
    return "필드가 가득 찼어요. 빈 슬롯이 필요해요.";
  return null;
}
export type DeckDraft = {
  editingId: string | null;
  name: string;
  championId: string | null;
  cards: string[];
};
export const draftKey = (user: string) => `ko-deck-edit-draft:${user}`;
export function readDeckDraft(raw: string | null): DeckDraft | null {
  try {
    const x = JSON.parse(raw ?? "null");
    if (
      !x ||
      typeof x.name !== "string" ||
      !(x.editingId === null || typeof x.editingId === "string") ||
      !(x.championId === null || typeof x.championId === "string") ||
      !Array.isArray(x.cards) ||
      x.cards.length > 100 ||
      x.cards.some((c: unknown) => typeof c !== "string")
    )
      return null;
    return {
      editingId: x.editingId,
      name: x.name,
      championId: x.championId,
      cards: x.cards,
    };
  } catch {
    return null;
  }
}
export function sameDraft(a: DeckDraft, b: DeckDraft) {
  return (
    a.editingId === b.editingId &&
    a.name === b.name &&
    a.championId === b.championId &&
    a.cards.length === b.cards.length &&
    a.cards.every((c, i) => c === b.cards[i])
  );
}
