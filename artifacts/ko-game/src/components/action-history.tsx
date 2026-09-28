import { useState } from 'react';
import { getCardDefinition, type CardInstance, type GameState } from '@/game';
import { eventTitle, findCard, historyEvents, playerLabel } from './action-history-utils';
import { CardInspectContent, Inspectable } from './alt-inspector';

function CardMiniature({
  state,
  cardInstanceId,
}: {
  state: GameState;
  cardInstanceId?: string;
}) {
  const card = findCard(state, cardInstanceId);
  if (!card) {
    return (
      <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-[6px] text-neutral-500">
        기록
      </div>
    );
  }
  const definition = state.cardPool?.find((entry) => entry.id === card.definitionId) ?? getCardDefinition(card.definitionId);

  return (
    <Inspectable
      content={<CardInspectContent card={card} />}
      className="relative shrink-0"
    >
      <div
        className="flex h-10 w-8 flex-col overflow-hidden rounded border border-neutral-600 bg-neutral-900 shadow"
        tabIndex={0}
      >
        <div className="flex flex-1 items-center justify-center overflow-hidden bg-neutral-950 text-[5px] text-neutral-600">
          {definition?.imageUrl ? <img src={definition.imageUrl} alt="" className="h-full w-full object-cover" /> : '카드'}
        </div>
        <div className="truncate border-t border-neutral-800 px-0.5 py-0.5 text-center text-[5px] font-bold text-neutral-300">
          {definition?.name ?? '카드'}
        </div>
      </div>
    </Inspectable>
  );
}

function HistoryList({ state, viewerPlayerId, expanded = false }: { state: GameState; viewerPlayerId: string; expanded?: boolean }) {
  const events = historyEvents(state, expanded ? Number.POSITIVE_INFINITY : 12);
  return (
    <div className="max-h-[52dvh] space-y-0.5 overflow-y-auto pr-1 md:max-h-none md:overflow-visible">
      {events.length === 0 ? (
        <div className="py-4 text-center text-[9px] text-neutral-600">아직 기록이 없습니다</div>
      ) : (
        events.map((event) => (
          <div
            key={`${state.events.indexOf(event)}-${event.type}-${event.cardInstanceId ?? ''}`}
            className={`flex items-center gap-1.5 rounded border-l-2 bg-neutral-950/90 p-1 shadow animate-in fade-in slide-in-from-left-1 duration-200 ${
              (event.sourceContext?.sourcePlayerId ?? event.playerId) === viewerPlayerId
                ? 'border-l-blue-500'
                : 'border-l-red-500'
            }`}
          >
            <CardMiniature
              state={state}
              cardInstanceId={
                event.cardInstanceId ??
                (event.source?.type === 'CARD' ? event.source.cardInstanceId : undefined)
              }
            />
            <div className="min-w-0">
              <div
                className={`text-[8px] font-bold ${
                  (event.sourceContext?.sourcePlayerId ?? event.playerId) === viewerPlayerId
                    ? 'text-blue-300'
                    : 'text-red-300'
                }`}
              >
                {playerLabel(state, event.sourceContext?.sourcePlayerId ?? event.playerId, viewerPlayerId)}
              </div>
                <div className="line-clamp-2 text-[9px] font-bold leading-tight text-neutral-200">
                {eventTitle(state, event, viewerPlayerId)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function ActionHistory({ state, viewerPlayerId = state.players[0].id }: { state: GameState; viewerPlayerId?: string }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const latestEvent = historyEvents(state)[0];

  return (
    <>
      <aside className="fixed left-3 top-1/2 z-50 hidden w-44 -translate-y-1/2 rounded border border-neutral-800 bg-black/85 p-1.5 shadow-2xl backdrop-blur-md md:block">
        <div className="mb-1 flex items-center justify-between border-b border-neutral-800 pb-1.5 text-[10px] font-black tracking-[0.18em] text-neutral-300">
          경기 기록 <button type="button" className="text-[9px] tracking-normal text-amber-300" onClick={() => setShowAll((open) => !open)}>{showAll ? '최근만' : '전체 보기'}</button>
        </div>
        <div className={showAll ? 'max-h-[65dvh] overflow-y-auto' : 'max-h-[48dvh] overflow-y-auto'}><HistoryList state={state} viewerPlayerId={viewerPlayerId} expanded={showAll} /></div>
      </aside>

      <div className="fixed left-2 top-24 z-50 md:hidden">
        <button
          type="button"
          aria-expanded={isMobileOpen}
          onClick={() => setIsMobileOpen((open) => !open)}
          className="flex max-w-44 flex-col rounded border border-neutral-700 bg-black/90 px-2 py-1.5 text-left text-[10px] font-black text-neutral-200 shadow-xl"
        >
          <span>경기 로그 {isMobileOpen ? '닫기' : '보기'}</span>
          {!isMobileOpen && latestEvent && <span className="mt-0.5 line-clamp-2 text-[9px] font-medium text-neutral-300">{eventTitle(state, latestEvent, viewerPlayerId)}</span>}
        </button>
        {isMobileOpen && (
          <div className="mt-1 w-48 rounded border border-neutral-800 bg-black/95 p-1.5 shadow-2xl">
            <button type="button" className="mb-1 text-[10px] font-bold text-amber-300" onClick={() => setShowAll((open) => !open)}>{showAll ? '최근 12개만 보기' : '전체 경기 기록 보기'}</button>
            <HistoryList state={state} viewerPlayerId={viewerPlayerId} expanded={showAll} />
          </div>
        )}
      </div>
    </>
  );
}
