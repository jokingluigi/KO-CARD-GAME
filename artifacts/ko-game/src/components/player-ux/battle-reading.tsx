import { getCardRuntimeRulesText } from "../../lib/card-display-state";
import { useEffect, useState } from "react";
import type { GameState, CardDefinition } from "@/game";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { CardRulesText } from "../card-rules-text";
import { CardArtwork } from "../card-artwork";
/** Read-only view. Does not select/play a card or alter the hand. */
export function HandReader({
  state,
  definition,
}: {
  state: GameState;
  definition: (id: string) => CardDefinition | undefined;
}) {
  const [open, setOpen] = useState(false),
    [index, setIndex] = useState(0);
  const hand = state.players[0].hand,
    card = hand[Math.min(index, Math.max(0, hand.length - 1))],
    def = card ? definition(card.definitionId) : undefined;
  useEffect(() => {
    setOpen(false);
    setIndex(0);
  }, [state.gameId]);
  return (
    <>
      <button
        type="button"
        className="min-h-11 border border-amber-800 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        손패 크게 읽기 ({hand.length}장)
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          overlayClassName="!z-[200]"
          className="!z-[210] max-h-[85dvh] overflow-auto bg-neutral-950 text-white"
        >
          <DialogTitle>손패 읽기</DialogTitle>
          <DialogDescription>
            카드를 사용하지 않고 설명을 읽습니다. 닫으면 기존 선택으로
            돌아갑니다.
          </DialogDescription>
          {card ? (
            <article className="ko-hand-reader">
              <div className="flex items-center gap-3">
                <CardArtwork
                  src={def?.imageUrl}
                  alt=""
                  className="h-28 w-24 shrink-0"
                  {...def}
                />
                <div>
                  <h3 className="text-xl text-amber-200">
                    {def?.name ?? "카드"}
                  </h3>
                  <p>
                    비용 {card.currentCost} · 공격 {card.currentAttack} · 체력{" "}
                    {card.currentHealth}
                  </p>
                </div>
              </div>
              <div className="my-4 text-base leading-7">
                <CardRulesText
                  text={getCardRuntimeRulesText(
                    card,
                    def?.rulesText ?? "설명 없음",
                  )}
                />
              </div>
              <nav
                className="flex items-center justify-between gap-2"
                aria-label="손패 읽기 이동"
              >
                <button
                  className="min-h-11 border px-4 disabled:opacity-40"
                  disabled={index === 0}
                  onClick={() => setIndex(Math.max(0, index - 1))}
                >
                  이전
                </button>
                <span>
                  {Math.min(index + 1, hand.length)} / {hand.length}
                </span>
                <button
                  className="min-h-11 border px-4 disabled:opacity-40"
                  disabled={index >= hand.length - 1}
                  onClick={() => setIndex(index + 1)}
                >
                  다음
                </button>
              </nav>
            </article>
          ) : (
            <p>손패가 없습니다.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export function BattleHelp() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="min-h-11 border border-amber-800 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        조작 안내 다시 보기
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          overlayClassName="!z-[200]"
          className="!z-[210] max-h-[85dvh] overflow-auto bg-neutral-950 text-white"
        >
          <DialogTitle>대전 조작</DialogTitle>
          <DialogDescription>
            설정에서 언제든 다시 확인할 수 있어요.
          </DialogDescription>
          <ol className="space-y-4 text-sm leading-6">
            <li>
              1. 손패를 누른 뒤 빈 아군 슬롯을 누르거나, 카드를 슬롯으로
              드래그해 소환하세요.
            </li>
            <li>
              2. 내 선수를 누른 뒤 강조된 상대 선수·챔피언을 선택해 공격하세요.
            </li>
            <li>
              3. 주문은 선택 후 ‘사용’을 누르거나 대상에게 드래그하세요. 가능한
              대상만 강조됩니다.
            </li>
            <li>
              4. 선택 취소 버튼 또는 Esc로 취소하세요. 이미 확정된 효과는 취소할
              수 없습니다.
            </li>
            <li>
              5. 카드의 ⓘ 또는 기존 길게 누르기·ALT 기능으로 상세정보를
              확인하세요. 손패 읽기에서는 큰 글씨로 넘겨볼 수 있어요.
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
