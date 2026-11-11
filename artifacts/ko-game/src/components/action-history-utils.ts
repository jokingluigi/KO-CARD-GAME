import {
  getCardDefinition,
  type CardInstance,
  type GameEvent,
  type GameState,
} from "../game";

const VISIBLE_EVENT_TYPES = new Set<GameEvent["type"]>([
  "TURN_STARTED",
  "TURN_ENDED",
  "CARD_DRAWN",
  "CARD_REVEALED",
  "CARD_ADDED_TO_HAND",
  "CARD_DISCARDED",
  "CHAMPION_ABILITY_CHANGED",
  "CHAMPION_GAME_START_ABILITY",
  "CHAMPION_QUEST_PROGRESS",
  "CARD_PLAYED",
  "ENTER_FIELD",
  "CHAMPION_ABILITY_USED",
  "CARD_GENERATED",
  "CARD_TRANSFORMED",
  "CARD_DESTROYED",
  "CARD_RETIRED",
  "CARD_REMOVED",
  "FUSION",
  "CARD_VANISHED",
  "ATTACK_DECLARED",
  "DAMAGE_DEALT",
  "STAT_CHANGED",
  "CARD_TEXT_GRANTED",
  "CHAMPION_QUEST_COMPLETED",
  "GOLD_CHANGED",
]);

export function findCard(
  state: GameState,
  cardInstanceId?: string,
): CardInstance | null {
  if (!cardInstanceId) return null;
  for (const player of state.players) {
    const cards = [
      ...player.deck,
      ...player.hand,
      ...player.board.filter((card): card is CardInstance => card !== null),
      ...player.graveyard,
      ...player.removedFromGame,
    ];
    const card = cards.find(
      (candidate) => candidate.instanceId === cardInstanceId,
    );
    if (card) return card;
  }
  return null;
}

export function playerLabel(
  state: GameState,
  playerId?: string,
  viewerPlayerId = state.players[0].id,
): string {
  if (!playerId) return "시스템";
  return playerId === viewerPlayerId ? "나" : "상대";
}

export function visibleHistoryCard(
  state: GameState,
  id: string | undefined,
  viewerPlayerId = state.players[0].id,
): CardInstance | null {
  if (!id) return null;
  const owner = state.players.find((p) =>
    [
      ...p.hand,
      ...p.deck,
      ...p.board,
      ...p.graveyard,
      ...p.removedFromGame,
    ].some((c) => c?.instanceId === id),
  );
  if (!owner) return null;
  const publicZone = [
    ...owner.board,
    ...owner.graveyard,
    ...owner.removedFromGame,
  ].some((c) => c?.instanceId === id);
  const disclosed = state.events.some(
    (e) =>
      ["CARD_PLAYED", "ENTER_FIELD", "CARD_REVEALED"].includes(e.type) &&
      e.cardInstanceId === id,
  );
  return owner.id === viewerPlayerId || publicZone || disclosed
    ? findCard(state, id)
    : null;
}
function cardName(
  state: GameState,
  cardInstanceId?: string,
  viewerPlayerId = state.players[0].id,
): string {
  const card = visibleHistoryCard(state, cardInstanceId, viewerPlayerId);
  return card
    ? (state.cardPool?.find((definition) => definition.id === card.definitionId)
        ?.name ??
        getCardDefinition(card.definitionId)?.name ??
        "알 수 없는 카드")
    : "알 수 없는 카드";
}

export function eventTitle(
  state: GameState,
  event: GameEvent,
  viewerPlayerId = state.players[0].id,
): string {
  const visibleName = (id?: string) => cardName(state, id, viewerPlayerId);
  const subject = (target: GameEvent["target"]) =>
    target?.type === "CARD"
      ? visibleName(target.cardInstanceId)
      : target?.type === "PLAYER"
        ? `${playerLabel(state, target.playerId, viewerPlayerId)} 챔피언`
        : "대상";
  switch (event.type) {
    case "TURN_STARTED":
      return "턴 시작";
    case "TURN_ENDED":
      return "턴 종료";
    case "CARD_ADDED_TO_HAND": return "카드를 손패에 추가";
    case "CARD_DISCARDED": return "손패 카드 버리기 · 묘지로 이동";
    case "CARD_REVEALED": return event.reason==="OVERDRAW" ? "손패 초과 · 공개 후 제외" : "카드 공개";
    case "CHAMPION_ABILITY_CHANGED": return `고유 능력 변경 · ${event.reason??""} (비용 ${event.amount??0})`;
    case "CARD_DRAWN":
      return event.playerId === viewerPlayerId
        ? `${visibleName(event.cardInstanceId)} 드로우`
        : "카드 드로우";
    case "CHAMPION_GAME_START_ABILITY":
      return "챔피언 게임 시작 능력";
    case "CHAMPION_QUEST_PROGRESS":
      return `피니셔 준비 진행 +${event.amount ?? 1}`;
    case "CARD_PLAYED":
      return `${visibleName(event.cardInstanceId)} 플레이`;
    case "ENTER_FIELD":
      return `${visibleName(event.cardInstanceId)} 소환`;
    case "CARD_GENERATED":
      return event.playerId === viewerPlayerId
        ? `${visibleName(event.cardInstanceId)} 생성`
        : "카드 생성";
    case "CARD_TRANSFORMED": {
      const next =
        state.cardPool?.find((definition) => definition.id === event.reason) ??
        getCardDefinition(event.reason ?? "");
      const previousId = event.tags
        ?.find((tag) => tag.startsWith("FROM:"))
        ?.slice(5);
      const previous =
        state.cardPool?.find((definition) => definition.id === previousId) ??
        getCardDefinition(previousId ?? "");
      const actor =
        event.source?.type === "CARD" &&
        event.source.cardInstanceId !== event.cardInstanceId
          ? `${visibleName(event.source.cardInstanceId)} 효과: `
          : "";
      return `${actor}${previous?.name ?? "선수"} → ${next?.name ?? "새 카드"} 변신`;
    }
    case "CARD_DESTROYED":
      return `${event.source?.type === "CARD" ? `${visibleName(event.source.cardInstanceId)} → ` : ""}${visibleName(event.cardInstanceId)} 파괴`;
    case "CARD_RETIRED":
      return `${visibleName(event.cardInstanceId)} 리타이어`;
    case "FUSION":
      return (
        (state.cardPool?.find((d) => d.id === event.cardDefinitionId)?.name ??
          "선수") +
        (event.reason === "FUSION_SOURCE" ? " 합체 재료" : " 합체 대상")
      );
    case "CARD_VANISHED":
      return (
        (state.cardPool?.find((d) => d.id === event.cardDefinitionId)?.name ??
          "선수") + " 소멸"
      );
    case "CARD_REMOVED":
      return `${visibleName(event.cardInstanceId)} 경기에서 제외`;
    case "DAMAGE_DEALT":
      return `${event.source?.type === "CARD" ? visibleName(event.source.cardInstanceId) : "효과"} → ${subject(event.target)}: ${event.reason === "DODGE" ? "회피" : `${event.amount ?? 0} 피해`}`;
    case "STAT_CHANGED": {
      const stat = {
        attack: "공격력",
        health: "체력",
        currentHealth: "체력",
        maxHealth: "최대 체력",
        cost: "비용",
      }[event.stat ?? "attack"];
      const source =
        event.source?.type === "CARD" &&
        event.source.cardInstanceId !== event.cardInstanceId
          ? `${visibleName(event.source.cardInstanceId)} → `
          : "";
      return `${source}${subject(event.target)} ${stat} ${event.delta && event.delta > 0 ? "+" : ""}${event.delta ?? 0}`;
    }
    case "CARD_TEXT_GRANTED":
      return `${subject(event.target)} 카드 효과 획득`;
    case "CHAMPION_QUEST_COMPLETED": {
      const champion = state.players.find(
        (player) => player.id === event.playerId,
      )?.champion;
      return `${champion?.name ?? "챔피언"} 피니셔 준비 완료${champion?.quest?.rewardText ? ` · ${champion.quest.rewardText}` : ""}`;
    }
    case "PROGRAM_ACTIVATED":
      return `${visibleName(event.cardInstanceId)} 업그레이드 · ${event.amount ?? 1}골드 추가 소비`;
    case "GOLD_CHANGED":
      return `${event.reason === "CHAMPION_QUEST_REWARD" ? "현재 완료 보상 " : ""}골드 ${event.amount && event.amount > 0 ? "+" : ""}${event.amount ?? 0}`;
    case "CHAMPION_ABILITY_USED":
      return "챔피언 고유 능력 사용";
    case "ATTACK_DECLARED": {
      const attacker =
        event.source?.type === "CARD"
          ? visibleName(event.source.cardInstanceId)
          : "선수";
      const target =
        event.target?.type === "CARD"
          ? visibleName(event.target.cardInstanceId)
          : event.target?.type === "PLAYER"
            ? `${playerLabel(state, event.target.playerId, viewerPlayerId)} 챔피언`
            : "대상";
      return `${attacker} → ${target}`;
    }
    default:
      return "";
  }
}

export function historyEvents(state: GameState, limit = 12): GameEvent[] {
  const playedCardIds = new Set(
    state.events
      .filter((event) => event.type === "CARD_PLAYED")
      .map((event) => event.cardInstanceId)
      .filter((id): id is string => id !== undefined),
  );

  return state.events
    .filter(
      (event) =>
        VISIBLE_EVENT_TYPES.has(event.type) &&
        (event.type !== "GOLD_CHANGED" ||
          event.reason === "CHAMPION_QUEST_REWARD") &&
        (event.type !== "STAT_CHANGED" || (event.delta ?? 0) !== 0),
    )
    .filter(
      (event) =>
        event.type !== "ENTER_FIELD" ||
        !event.cardInstanceId ||
        !playedCardIds.has(event.cardInstanceId),
    )
    .slice(-limit)
    .reverse();
}

export type HistoryGroup = {
  id: string;
  events: GameEvent[];
  first: number;
  last: number;
  primary: GameEvent;
};
/** Explicit effect identities win. Legacy records use actual action boundaries, never time gaps. */
export function historyGroups(state: GameState, limit = 12): HistoryGroup[] {
  const visible = new Set(historyEvents(state, Number.POSITIVE_INFINITY));
  const groups = new Map<string, HistoryGroup>(),
    aliases = new Map<string, string>();
  let boundary: string | null = null;
  state.events.forEach((event, index) => {
    const starts = [
      "CARD_PLAYED",
      "ATTACK_DECLARED",
      "CHAMPION_ABILITY_USED",
      "TURN_STARTED",
      "TURN_ENDED",
    ].includes(event.type);
    if (starts) boundary = `action:${index}`;
    const explicit = event.presentationResolutionId
      ? `resolution:${event.presentationResolutionId}`
      : event.sourceContext?.rootSourceEventId
        ? `root:${event.sourceContext.rootSourceEventId}`
        : null;
    const id = starts
      ? boundary!
      : explicit && aliases.has(explicit)
        ? aliases.get(explicit)!
        : (boundary ?? explicit ?? `event:${index}`);
    if (explicit) aliases.set(explicit, id);
    if (!visible.has(event)) return;
    const group = groups.get(id);
    if (group) {
      group.events.push(event);
      group.last = index;
      if (starts) group.primary = event;
    } else
      groups.set(id, {
        id,
        events: [event],
        first: index,
        last: index,
        primary: event,
      });
  });
  return [...groups.values()].sort((a, b) => b.last - a.last).slice(0, limit);
}
export function historyGroupSummary(group: HistoryGroup) {
  const damage = group.events
    .filter((e) => e.type === "DAMAGE_DEALT")
    .reduce((n, e) => n + Math.max(0, e.amount ?? 0), 0);
  const summons = group.events.filter(
    (e) =>
      e.type === "ENTER_FIELD" ||
      (e.type === "CARD_PLAYED" && e.cardType === "WRESTLER"),
  ).length;
  const healing = group.events
    .filter(
      (e) =>
        e.type === "STAT_CHANGED" &&
        ["health", "currentHealth"].includes(e.stat ?? "") &&
        /HEAL|RECOVER/.test(e.reason ?? ""),
    )
    .reduce((n, e) => n + Math.max(0, e.delta ?? 0), 0);
  return [
    damage ? `피해 합계 ${damage}` : null,
    healing ? `회복 ${healing}` : null,
    summons ? `소환 ${summons}` : null,
    `${group.events.length}개 기록`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export type ObservedHealing = {
  id: string;
  playerId: string;
  amount: number;
  applications: number;
  actionIndex: number | null;
};
/** Actual healing totals, not net HP/max-HP guesses. No replay of history on mount. */
export function observedChampionHealing(
  before: GameState,
  after: GameState,
): ObservedHealing[] {
  if (
    before.gameId !== after.gameId ||
    after.events.length < before.events.length
  )
    return [];
  const actions = after.events
    .slice(before.events.length)
    .flatMap((e, i) =>
      ["CARD_PLAYED", "ATTACK_DECLARED", "CHAMPION_ABILITY_USED"].includes(
        e.type,
      )
        ? [i + before.events.length]
        : [],
    );
  return after.players.flatMap((p) => {
    const old = before.players.find((x) => x.id === p.id)?.presentationHealing,
      next = p.presentationHealing;
    if (
      !next ||
      next.sequence <= (old?.sequence ?? 0) ||
      next.total <= (old?.total ?? 0)
    )
      return [];
    return [
      {
        id: `${p.id}:${next.sequence}`,
        playerId: p.id,
        amount: next.total - (old?.total ?? 0),
        applications: next.sequence - (old?.sequence ?? 0),
        actionIndex: actions.length === 1 ? actions[0] : null,
      },
    ];
  });
}
