import { CardArtwork } from "./card-artwork";
import { CardDetailDialog, type CardDetailRecord } from "./card-detail-dialog";
import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { getCardDefinition, type CardInstance, type GameState } from "@/game";
import {
  eventTitle,
  visibleHistoryCard,
  historyGroups,
  historyGroupSummary,
  observedChampionHealing,
  type ObservedHealing,
  playerLabel,
} from "./action-history-utils";
import { CardInspectContent, Inspectable } from "./alt-inspector";

function CardMiniature({
  state,
  cardInstanceId,
  onDetail,
  viewerPlayerId,
}: {
  state: GameState;
  cardInstanceId?: string;
  onDetail: (card: CardDetailRecord) => void;
  viewerPlayerId: string;
}) {
  const card = visibleHistoryCard(state, cardInstanceId, viewerPlayerId);
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
            <CardArtwork
              src={definition.imageUrl}
              alt=""
              className="h-full w-full"
              {...definition}
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
  healing,
}: {
  state: GameState;
  viewerPlayerId: string;
  expanded?: boolean;
  healing: ObservedHealing[];
}) {
  const [detail, setDetail] = useState<CardDetailRecord | null>(null);
  const groups = historyGroups(state, expanded ? Number.POSITIVE_INFINITY : 12);
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
        {groups.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-400">
            아직 기록이 없습니다
          </p>
        ) : (
          groups.map((group) => (
            <details
              key={group.id}
              className="border-l-2 border-amber-800 bg-neutral-950/90 p-2"
              data-history-group={group.id}
            >
              <summary className="min-h-11 cursor-pointer text-sm leading-6 text-neutral-100">
                <strong className="text-amber-200">
                  {playerLabel(
                    state,
                    group.primary.sourceContext?.sourcePlayerId ??
                      group.primary.playerId,
                    viewerPlayerId,
                  )}
                </strong>{" "}
                · {eventTitle(state, group.primary, viewerPlayerId)}
                <span className="block text-xs text-neutral-400">
                  {historyGroupSummary(group)}
                  {healing
                    .filter((h) => h.actionIndex === group.first)
                    .map((h) => (
                      <span key={h.id}>
                        {" "}
                        · {playerLabel(state, h.playerId, viewerPlayerId)}{" "}
                        챔피언 회복 +{h.amount}
                      </span>
                    ))}{" "}
                  · 눌러 세부 기록
                </span>
              </summary>
              <ol className="mt-2 space-y-2">
                {group.events.map((event, index) => (
                  <li
                    key={`${group.first}:${index}`}
                    className="flex items-center gap-3 border-t border-neutral-800 py-2"
                  >
                    <CardMiniature
                      state={state}
                      viewerPlayerId={viewerPlayerId}
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
                    <span className="text-sm leading-6">
                      {eventTitle(state, event, viewerPlayerId)}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          ))
        )}
        {healing.some((h) => h.actionIndex === null) && (
          <section className="border-t border-neutral-700 pt-3 text-sm">
            <h3 className="mb-2 text-amber-200">확인한 챔피언 회복</h3>
            {healing
              .filter((h) => h.actionIndex === null)
              .slice()
              .reverse()
              .map((h) => (
                <p key={h.id}>
                  {playerLabel(state, h.playerId, viewerPlayerId)} +{h.amount} ·{" "}
                  {h.applications}회
                </p>
              ))}
            <p className="mt-2 text-xs text-neutral-400">
              처리 단위를 확인할 수 없는 회복은 따로 표시합니다.
            </p>
          </section>
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
  const [showAll, setShowAll] = useState(false),
    [healing, setHealing] = useState<ObservedHealing[]>([]);
  const previous = useRef(state);
  useEffect(() => {
    const old = previous.current;
    previous.current = state;
    if (
      old.gameId !== state.gameId ||
      state.events.length < old.events.length
    ) {
      setHealing([]);
      return;
    }
    const next = observedChampionHealing(old, state);
    if (next.length) setHealing((items) => [...items, ...next].slice(-40));
  }, [state]);
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
            최근 행동부터 묶어 표시합니다. 펼친 뒤 카드 그림을 누르면 상세정보를
            확인할 수 있어요.
          </DialogDescription>
          <button
            type="button"
            className="min-h-11 text-left text-xs font-bold text-amber-300"
            onClick={() => setShowAll((open) => !open)}
          >
            {showAll ? "최근 12묶음만 보기" : "전체 기록 보기"}
          </button>
          <HistoryList
            state={state}
            viewerPlayerId={viewerPlayerId}
            expanded={showAll}
            healing={healing}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
