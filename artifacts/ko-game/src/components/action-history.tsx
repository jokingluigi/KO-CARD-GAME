import { CardDetailDialog, type CardDetailRecord } from "./card-detail-dialog";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { getCardDefinition, type CardInstance, type GameState } from "@/game";
import {
  eventTitle,
  findCard,
  historyEvents,
  playerLabel,
} from "./action-history-utils";
import { CardInspectContent, Inspectable } from "./alt-inspector";

function CardMiniature({
  state,
  cardInstanceId,
  onDetail,
}: {
  state: GameState;
  cardInstanceId?: string;
  onDetail: (card: CardDetailRecord) => void;
}) {
  const card = findCard(state, cardInstanceId);
  if (!card) {
    return (
      <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-[6px] text-neutral-500">
        기록
      </div>
    );
  }
  const definition =
    state.cardPool?.find((entry) => entry.id === card.definitionId) ??
    getCardDefinition(card.definitionId);

  return (
    <Inspectable
      content={<CardInspectContent card={card} />}
      className="relative shrink-0"
    >
      <div
        role="button"
        aria-label={`${definition?.name ?? "카드"} 상세정보`}
        onClick={() => {
          if (definition)
            onDetail({
              id: definition.id,
              name: definition.name ?? "카드",
              cardType: definition.cardType ?? "WRESTLER",
              text: definition.rulesText,
              cost: definition.cost,
              attack: definition.attack,
              health: definition.health,
              rarity: definition.rarity ?? "NORMAL",
              imageUrl: definition.imageUrl ?? null,
              imageDisplayMode: definition.imageDisplayMode ?? "CONTAIN",
              imageScale: definition.imageScale ?? 1,
              imagePositionX: definition.imagePositionX ?? 50,
              imagePositionY: definition.imagePositionY ?? 50,
            });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.currentTarget.click();
          }
        }}
        className="flex h-11 w-11 flex-col overflow-hidden rounded border border-neutral-600 bg-neutral-900 shadow"
        tabIndex={0}
      >
        <div className="flex flex-1 items-center justify-center overflow-hidden bg-neutral-950 text-[5px] text-neutral-600">
          {definition?.imageUrl ? (
            <img
              src={definition.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            "카드"
          )}
        </div>
        <div className="truncate border-t border-neutral-800 px-0.5 py-0.5 text-center text-[5px] font-bold text-neutral-300">
          {definition?.name ?? "카드"}
        </div>
      </div>
    </Inspectable>
  );
}

function HistoryList({
  state,
  viewerPlayerId,
  expanded = false,
}: {
  state: GameState;
  viewerPlayerId: string;
  expanded?: boolean;
}) {
  const [detail, setDetail] = useState<CardDetailRecord | null>(null);
  const events = historyEvents(state, expanded ? Number.POSITIVE_INFINITY : 12);
  return (
    <>
      <CardDetailDialog
        card={detail}
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />
      <div className="ko-history-events max-h-[58dvh] space-y-0.5 overflow-y-auto pr-1 md:max-h-none md:overflow-visible">
        {events.length === 0 ? (
          <div className="py-4 text-center text-[9px] text-neutral-600">
            아직 기록이 없습니다
          </div>
        ) : (
          events.map((event) => (
            <div
              key={`${state.events.indexOf(event)}-${event.type}-${event.cardInstanceId ?? ""}`}
              className={`flex items-center gap-1.5 rounded border-l-2 bg-neutral-950/90 p-1 shadow animate-in fade-in slide-in-from-left-1 duration-200 ${
                (event.sourceContext?.sourcePlayerId ?? event.playerId) ===
                viewerPlayerId
                  ? "border-l-blue-500"
                  : "border-l-red-500"
              }`}
            >
              <CardMiniature
                state={state}
                onDetail={setDetail}
                cardInstanceId={
                  (event.type === "CARD_DRAWN" ||
                    event.type === "CARD_GENERATED") &&
                  event.playerId !== viewerPlayerId
                    ? undefined
                    : (event.cardInstanceId ??
                      (event.source?.type === "CARD"
                        ? event.source.cardInstanceId
                        : undefined))
                }
              />
              <div className="min-w-0">
                <div
                  className={`text-xs font-bold ${
                    (event.sourceContext?.sourcePlayerId ?? event.playerId) ===
                    viewerPlayerId
                      ? "text-blue-300"
                      : "text-red-300"
                  }`}
                >
                  <span className="mr-1 text-amber-300">
                    {state.events.indexOf(event) + 1}.
                  </span>
                  {playerLabel(
                    state,
                    event.sourceContext?.sourcePlayerId ?? event.playerId,
                    viewerPlayerId,
                  )}
                </div>
                <div className="text-sm font-bold leading-tight text-neutral-200">
                  {eventTitle(state, event, viewerPlayerId)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

export function ActionHistory({
  state,
  viewerPlayerId = state.players[0].id,
  mobileOpen = false,
  onMobileClose,
}: {
  state: GameState;
  viewerPlayerId?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  return (
    <>
      <Dialog
        open={mobileOpen}
        onOpenChange={(open) => {
          if (!open) onMobileClose?.();
        }}
      >
        <DialogContent
          overlayClassName="!z-[160]"
          className="ko-history-sheet !z-[170] w-[calc(100vw-24px)] max-h-[calc(100dvh-24px)] overflow-y-auto rounded-none border border-amber-700 bg-black text-neutral-100"
        >
          <DialogTitle className="text-left text-base font-black text-amber-300">
            경기 기록
          </DialogTitle>
          <button
            type="button"
            className="min-h-11 border border-amber-700 px-3 text-sm font-bold text-amber-300"
            onClick={onMobileClose}
          >
            경기 로그 닫기
          </button>
          <DialogDescription className="text-left text-xs text-neutral-400">
            최근 사건부터 표시합니다. 카드 그림을 누르면 상세정보를 확인할 수
            있어요.
          </DialogDescription>
          <button
            type="button"
            className="min-h-11 text-left text-xs font-bold text-amber-300"
            onClick={() => setShowAll((open) => !open)}
          >
            {showAll ? "최근 12개만 보기" : "전체 기록 보기"}
          </button>
          <HistoryList
            state={state}
            viewerPlayerId={viewerPlayerId}
            expanded={showAll}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
