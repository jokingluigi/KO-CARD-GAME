import { CardDetailDialog, type CardDetailRecord } from "../card-detail-dialog";
import { observePublicCards } from "./public-cards-policy";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { CardRenderer } from "../card-renderer";
import { getCardDefinition, type GameState } from "@/game";
export function usePublicCardIds(state: GameState) {
  const count = useRef(0);
  const seen = useRef(new Map<string, string>()),
    identity = useRef(state.gameId + state.players[1].id);
  if (identity.current !== state.gameId + state.players[1].id) {
    seen.current.clear();
    count.current = 0;
    identity.current = state.gameId + state.players[1].id;
  }
  const ids = observePublicCards(
    state,
    seen.current,
    count.current > state.events.length ? 0 : count.current,
  );
  count.current = state.events.length;
  return ids;
}
export function PublicCards({
  state,
  ids,
}: {
  state: GameState;
  ids: string[];
}) {
  const [open, setOpen] = useState(false),
    [detail, setDetail] = useState<CardDetailRecord | null>(null);
  return (
    <>
      <button
        type="button"
        className="min-h-11 border border-amber-800 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        상대 공개 카드 ({ids.length}종류)
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-auto bg-neutral-950 text-white">
          <DialogTitle>상대가 공개한 카드</DialogTitle>
          <DialogDescription>
            이번 접속에서 필드에 등장했거나 사용·공개가 명시적으로 확인된 결과로
            확인된 카드입니다. 숨겨진 손패와 덱은 조회하지 않습니다. 카드를
            누르면 기본 정보를 확인할 수 있습니다.
          </DialogDescription>
          <div className="grid grid-cols-3 gap-2">
            {ids.map((id) => {
              const d =
                state.cardPool?.find((c) => c.id === id) ??
                getCardDefinition(id);
              return d ? (
                <CardRenderer
                  key={id}
                  onClick={() =>
                    setDetail({
                      id: d.id,
                      name: d.name ?? "카드",
                      cardType: d.cardType ?? "WRESTLER",
                      cost: d.cost,
                      attack: d.attack,
                      health: d.health,
                      text: d.rulesText,
                      rarity: d.rarity ?? "NORMAL",
                      imageUrl: d.imageUrl ?? null,
                      imageDisplayMode: d.imageDisplayMode ?? "CONTAIN",
                      imageScale: d.imageScale ?? 1,
                      imagePositionX: d.imagePositionX ?? 50,
                      imagePositionY: d.imagePositionY ?? 50,
                    })
                  }
                  name={d.name}
                  cardType={
                    d.cardType === "TECHNIQUE" ? "TECHNIQUE" : "WRESTLER"
                  }
                  cost={d.cost}
                  attack={d.attack}
                  health={d.health}
                  imageUrl={d.imageUrl}
                  rulesText={d.rulesText}
                  rarity={d.rarity}
                  size="detail"
                />
              ) : (
                <p key={id}>공개 카드 정보 없음</p>
              );
            })}
          </div>
          {!ids.length && <p>아직 확인된 카드가 없습니다.</p>}
        </DialogContent>
      </Dialog>
      <CardDetailDialog
        card={detail}
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) setDetail(null);
        }}
      />
    </>
  );
}
