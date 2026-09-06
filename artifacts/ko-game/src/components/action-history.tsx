import { useState } from 'react';
import { getCardDefinition, type CardInstance, type GameEvent, type GameState } from '@/game';

const VISIBLE_EVENT_TYPES = new Set<GameEvent['type']>([
  'CARD_PLAYED',
  'ENTER_FIELD',
  'CHAMPION_ABILITY_USED',
  'CARD_GENERATED',
  'CARD_DESTROYED',
  'CARD_RETIRED',
  'ATTACK_DECLARED',
]);

function findCard(state: GameState, cardInstanceId?: string): CardInstance | null {
  if (!cardInstanceId) return null;
  for (const player of state.players) {
    const cards = [
      ...player.deck,
      ...player.hand,
      ...player.board.filter((card): card is CardInstance => card !== null),
      ...player.graveyard,
      ...player.removedFromGame,
    ];
    const card = cards.find((candidate) => candidate.instanceId === cardInstanceId);
    if (card) return card;
  }
  return null;
}

function playerLabel(state: GameState, playerId?: string): string {
  if (!playerId) return '시스템';
  return playerId === state.players[0].id ? '나' : '상대';
}

function cardName(state: GameState, cardInstanceId?: string): string {
  const card = findCard(state, cardInstanceId);
  return card
    ? getCardDefinition(card.definitionId)?.name ?? '알 수 없는 카드'
    : '알 수 없는 카드';
}

function eventTitle(state: GameState, event: GameEvent): string {
  switch (event.type) {
    case 'CARD_PLAYED':
      return `${cardName(state, event.cardInstanceId)} 플레이`;
    case 'ENTER_FIELD':
      return `${cardName(state, event.cardInstanceId)} 소환`;
    case 'CARD_GENERATED':
      return `${cardName(state, event.cardInstanceId)} 생성`;
    case 'CARD_DESTROYED':
      return `${cardName(state, event.cardInstanceId)} 파괴`;
    case 'CARD_RETIRED':
      return `${cardName(state, event.cardInstanceId)} 리타이어`;
    case 'CHAMPION_ABILITY_USED':
      return '챔피언 고유 능력 사용';
    case 'ATTACK_DECLARED': {
      const attacker =
        event.source?.type === 'CARD'
          ? cardName(state, event.source.cardInstanceId)
          : '선수';
      const target =
        event.target?.type === 'CARD'
          ? cardName(state, event.target.cardInstanceId)
          : event.target?.type === 'PLAYER'
            ? `${playerLabel(state, event.target.playerId)} 챔피언`
            : '대상';
      return `${attacker} → ${target}`;
    }
    default:
      return '';
  }
}

function historyEvents(state: GameState): GameEvent[] {
  const playedCardIds = new Set(
    state.events
      .filter((event) => event.type === 'CARD_PLAYED')
      .map((event) => event.cardInstanceId)
      .filter((id): id is string => id !== undefined),
  );

  return state.events
    .filter((event) => VISIBLE_EVENT_TYPES.has(event.type))
    .filter(
      (event) =>
        event.type !== 'ENTER_FIELD' ||
        !event.cardInstanceId ||
        !playedCardIds.has(event.cardInstanceId),
    )
    .slice(-10)
    .reverse();
}

function CardMiniature({
  state,
  cardInstanceId,
}: {
  state: GameState;
  cardInstanceId?: string;
}) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const card = findCard(state, cardInstanceId);
  if (!card) {
    return (
      <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-[7px] text-neutral-500">
        기록
      </div>
    );
  }
  const definition = getCardDefinition(card.definitionId);

  return (
    <div
      className="relative shrink-0"
      tabIndex={0}
      onMouseEnter={() => setIsDetailOpen(true)}
      onMouseLeave={() => setIsDetailOpen(false)}
      onFocus={() => setIsDetailOpen(true)}
      onBlur={() => setIsDetailOpen(false)}
    >
      <div className="flex h-12 w-9 flex-col overflow-hidden rounded border border-neutral-600 bg-neutral-900 shadow">
        <div className="flex flex-1 items-center justify-center bg-neutral-950 text-[6px] text-neutral-600">
          이미지 없음
        </div>
        <div className="truncate border-t border-neutral-800 px-0.5 py-0.5 text-center text-[6px] font-bold text-neutral-300">
          {definition?.name ?? '카드'}
        </div>
      </div>
      {isDetailOpen && (
        <div className="pointer-events-none absolute left-full top-0 z-[70] ml-2 w-44 rounded border border-neutral-700 bg-neutral-950 p-3 text-left shadow-2xl">
          <div className="mb-2 font-bold text-white">{definition?.name ?? '알 수 없는 카드'}</div>
          <div className="mb-2 flex gap-3 font-mono text-xs">
            <span className="text-blue-300">{card.currentCost}G</span>
            <span className="text-amber-300">공격 {card.currentAttack}</span>
            <span className="text-red-300">체력 {card.currentHealth}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-neutral-400">
            {definition?.rulesText || '효과 없음'}
          </p>
        </div>
      )}
    </div>
  );
}

function HistoryList({ state }: { state: GameState }) {
  const events = historyEvents(state);
  return (
    <div className="max-h-[62dvh] space-y-1 overflow-y-auto pr-1 md:max-h-none md:overflow-visible">
      {events.length === 0 ? (
        <div className="py-6 text-center text-[10px] text-neutral-600">아직 기록이 없습니다</div>
      ) : (
        events.map((event, index) => (
          <div
            key={`${state.events.length - index}-${event.type}-${event.cardInstanceId ?? ''}`}
            className={`flex items-center gap-2 rounded border-l-2 bg-neutral-950/90 p-1.5 shadow animate-in fade-in slide-in-from-left-1 duration-200 ${
              event.playerId === state.players[0].id
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
                  event.playerId === state.players[0].id
                    ? 'text-blue-300'
                    : 'text-red-300'
                }`}
              >
                {playerLabel(state, event.playerId)}
              </div>
              <div className="line-clamp-2 text-[10px] font-bold leading-tight text-neutral-200">
                {eventTitle(state, event)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function ActionHistory({ state }: { state: GameState }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <>
      <aside className="fixed left-3 top-1/2 z-50 hidden w-44 -translate-y-1/2 rounded border border-neutral-800 bg-black/85 p-2 shadow-2xl backdrop-blur-md md:block">
        <div className="mb-2 border-b border-neutral-800 pb-2 text-[11px] font-black tracking-[0.18em] text-neutral-300">
          플레이 기록
        </div>
        <HistoryList state={state} />
      </aside>

      <div className="fixed left-2 top-24 z-50 md:hidden">
        <button
          type="button"
          aria-expanded={isMobileOpen}
          onClick={() => setIsMobileOpen((open) => !open)}
          className="rounded border border-neutral-700 bg-black/90 px-3 py-2 text-[10px] font-black text-neutral-200 shadow-xl"
        >
          플레이 기록
        </button>
        {isMobileOpen && (
          <div className="mt-1 w-48 rounded border border-neutral-800 bg-black/95 p-2 shadow-2xl">
            <HistoryList state={state} />
          </div>
        )}
      </div>
    </>
  );
}