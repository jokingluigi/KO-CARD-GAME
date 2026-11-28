import { CardArtwork } from "./card-artwork";
import { CardDetailDialog, type CardDetailRecord } from "./card-detail-dialog";
import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { getCardDefinition, type CardInstance, type GameEvent, type GameState } from "@/game";
import "./action-history.css";
import { matchTurnNumber } from "@workspace/game-engine/rules";
import {
  eventTitle,
  visibleHistoryCard,
  historyGroups,
  historyDetailLines,
  type HistoryGroup,
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
      <span className="ko-log__icon" aria-hidden="true">·</span>
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
      lore: definition.lore,
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
        className="ko-log__thumb"
        tabIndex={0}
      >
        <div className="ko-log__thumb-art">
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
      </div>
    </Inspectable>
  );
}

type Row =
  | { kind: "turn"; key: string; label: string; mine: boolean }
  | { kind: "action"; key: string; group: HistoryGroup; actor: string | undefined; draws?: { count: number; names: string[] } };

const isDrawOnly = (group: HistoryGroup) =>
  group.events.every((event) => event.type === "CARD_DRAWN" || event.type === "TURN_STARTED" || event.type === "TURN_ENDED") &&
  group.events.some((event) => event.type === "CARD_DRAWN");

function eventTone(event: GameEvent): string {
  if (event.type === "DAMAGE_DEALT") return event.reason === "DODGE" ? "dodge" : "damage";
  if (event.type === "CARD_DESTROYED" || event.type === "CARD_RETIRED" || event.type === "CARD_VANISHED" || event.type === "CARD_REMOVED") return "destroy";
  if (event.type === "STAT_CHANGED") return (event.delta ?? 0) > 0 ? "buff" : "debuff";
  if (event.type === "CHAMPION_QUEST_PROGRESS" || event.type === "CHAMPION_QUEST_COMPLETED") return "quest";
  if (event.type === "ENTER_FIELD" || event.type === "CARD_GENERATED") return "summon";
  return "plain";
}

/** Newest first, separated by turn, with consecutive draws folded into one line. */
function buildRows(state: GameState, viewerPlayerId: string, limit: number): Row[] {
  const groups = historyGroups(state, Number.POSITIVE_INFINITY);
  const turnStarts = state.events.flatMap((event, index) => event.type === "TURN_STARTED" ? [{ index, playerId: event.playerId }] : []);
  const turnOf = (index: number) => {
    let found = -1;
    for (let i = 0; i < turnStarts.length; i += 1) if (turnStarts[i]!.index <= index) found = i;
    return found;
  };
  const rows: Row[] = [];
  let lastTurn: number | null = null;
  let actions = 0;
  for (const group of groups) {
    const turn = turnOf(group.first);
    if (turn !== lastTurn) {
      if (actions >= limit) break;
      lastTurn = turn;
      const starter = turn >= 0 ? turnStarts[turn]!.playerId : undefined;
      rows.push({ kind: "turn", key: `turn:${turn}`, mine: starter === viewerPlayerId,
        label: turn < 0 ? "게임 시작" : `제 ${matchTurnNumber(Math.max(1, (state.turn ?? turnStarts.length) - (turnStarts.length - 1 - turn)))}턴 · ${starter === viewerPlayerId ? "내 턴" : "상대 턴"}` });
    }
    const actor = group.primary.sourceContext?.sourcePlayerId ?? group.primary.playerId;
    const onlyTurnMarker = group.events.every((event) => event.type === "TURN_STARTED" || event.type === "TURN_ENDED");
    if (onlyTurnMarker) continue;
    if (isDrawOnly(group)) {
      const draws = group.events.filter((event) => event.type === "CARD_DRAWN");
      const drawer = draws[0]!.playerId;
      const prev = rows[rows.length - 1];
      const names = draws.map((event) => eventTitle(state, event, viewerPlayerId).replace(/ 드로우$/, "")).filter((name) => name !== "카드");
      if (prev?.kind === "action" && prev.draws && prev.actor === drawer) {
        prev.draws.count += draws.length; prev.draws.names.push(...names); continue;
      }
      rows.push({ kind: "action", key: group.id, group, actor: drawer, draws: { count: draws.length, names } });
      actions += 1;
      continue;
    }
    rows.push({ kind: "action", key: group.id, group, actor });
    actions += 1;
  }
  return rows;
}

/** "공격 · 내 카드 → 상대 카드": same-named cards on both sides stay readable. */
function attackTitle(state: GameState, event: GameEvent, viewerPlayerId: string): string {
  const owner = (id?: string) => state.players.find((p) => [...p.hand, ...p.deck, ...p.board, ...p.graveyard, ...p.removedFromGame].some((c) => c?.instanceId === id))?.id;
  const name = (id?: string) => { const card = visibleHistoryCard(state, id, viewerPlayerId); return card ? (state.cardPool?.find((d) => d.id === card.definitionId)?.name ?? getCardDefinition(card.definitionId)?.name ?? "선수") : "선수"; };
  const attacker = event.source?.type === "CARD" ? name(event.source.cardInstanceId) : "선수";
  const target = event.target?.type === "CARD"
    ? `${owner(event.target.cardInstanceId) === viewerPlayerId ? "내" : "상대"} ${name(event.target.cardInstanceId)}`
    : event.target?.type === "PLAYER" ? `${event.target.playerId === viewerPlayerId ? "내" : "상대"} 챔피언` : "대상";
  return `공격 · ${attacker} → ${target}`;
}

function primaryCardId(group: HistoryGroup, viewerPlayerId: string): string | undefined {
  const event = group.primary.type === "TURN_STARTED" || group.primary.type === "TURN_ENDED"
    ? group.events.find((candidate) => candidate.type !== "TURN_STARTED" && candidate.type !== "TURN_ENDED") ?? group.primary
    : group.primary;
  if ((event.type === "CARD_DRAWN" || event.type === "CARD_GENERATED") && event.playerId !== viewerPlayerId) return undefined;
  return event.cardInstanceId ?? (event.source?.type === "CARD" ? event.source.cardInstanceId : undefined);
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
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const rows = buildRows(state, viewerPlayerId, expanded ? Number.POSITIVE_INFINITY : 14);
  return (
    <>
      <CardDetailDialog card={detail} open={!!detail} onOpenChange={(next) => { if (!next) setDetail(null); }} />
      <ol className="ko-log">
        {rows.length === 0 && <li className="ko-log__empty">아직 기록이 없어요.</li>}
        {rows.map((row) => {
          if (row.kind === "turn") return <li key={row.key} className="ko-log__turn" data-mine={row.mine || undefined}><span>{row.label}</span></li>;
          const { group } = row;
          const mine = row.actor === viewerPlayerId;
          const who = playerLabel(state, row.actor, viewerPlayerId);
          if (row.draws) {
            const shown = row.draws.names;
            return (
              <li key={row.key} className="ko-log__row ko-log__row--quiet" data-side={mine ? "me" : "opp"}>
                <span className="ko-log__icon" aria-hidden="true"><i className="ko-log__back" /></span>
                <div className="ko-log__body">
                  <p className="ko-log__title"><b>{who}</b> 카드 {row.draws.count}장 드로우</p>
                  {shown.length > 0 && <p className="ko-log__sub">{shown.join(", ")}</p>}
                </div>
              </li>
            );
          }
          const head = group.primary.type === "TURN_STARTED" ? (group.events.find((e) => e.type !== "TURN_STARTED") ?? group.primary) : group.primary;
          const title = head.type === "ATTACK_DECLARED" ? attackTitle(state, head, viewerPlayerId) : eventTitle(state, head, viewerPlayerId);
          const details = historyDetailLines(state, group, viewerPlayerId);
          const heal = healing.filter((h) => h.actionIndex === state.events.indexOf(group.primary));
          const isOpen = open.has(row.key);
          const visible = isOpen ? details : details.slice(0, 4);
          return (
            <li key={row.key} className="ko-log__row" data-side={mine ? "me" : "opp"} data-history-group={group.id}>
              <CardMiniature state={state} viewerPlayerId={viewerPlayerId} onDetail={setDetail} cardInstanceId={primaryCardId(group, viewerPlayerId)} />
              <div className="ko-log__body">
                <p className="ko-log__title"><b>{who}</b> {title}</p>
                {(visible.length > 0 || heal.length > 0) && (
                  <ul className="ko-log__lines">
                    {visible.map(({ event, text }, index) => <li key={index} data-tone={eventTone(event)}>{text}</li>)}
                    {heal.map((h) => <li key={h.id} data-tone="heal">{playerLabel(state, h.playerId, viewerPlayerId)} 챔피언 회복 +{h.amount}</li>)}
                  </ul>
                )}
                {details.length > 4 && (
                  <button type="button" className="ko-log__more" onClick={() => setOpen((current) => { const next = new Set(current); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next; })}>
                    {isOpen ? "접기" : `${details.length - 4}개 더 보기`}
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {healing.some((h) => h.actionIndex === null) && (
          <li className="ko-log__row ko-log__row--quiet">
            <span className="ko-log__icon" aria-hidden="true">+</span>
            <div className="ko-log__body">
              <p className="ko-log__title">챔피언 회복</p>
              <ul className="ko-log__lines">
                {healing.filter((h) => h.actionIndex === null).slice().reverse().map((h) => <li key={h.id} data-tone="heal">{playerLabel(state, h.playerId, viewerPlayerId)} +{h.amount} · {h.applications}회</li>)}
              </ul>
            </div>
          </li>
        )}
      </ol>
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
          className="ko-history-sheet !z-[170] w-[calc(100vw-24px)] max-w-[560px] max-h-[calc(100dvh-24px)] overflow-y-auto text-neutral-100"
        >
          <div className="ko-log-head">
            <DialogTitle className="ko-log-head__title">경기 기록</DialogTitle>
            <button type="button" className="ko-log-head__toggle" onClick={() => setShowAll((open) => !open)}>{showAll ? "최근만 보기" : "전체 보기"}</button>
            <button type="button" className="ko-log-head__close" aria-label="경기 로그 닫기" onClick={onMobileClose}>✕</button>
          </div>
          <DialogDescription className="sr-only">최근 행동이 위에 있어요. 카드 그림을 누르면 자세히 볼 수 있어요.</DialogDescription>
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
