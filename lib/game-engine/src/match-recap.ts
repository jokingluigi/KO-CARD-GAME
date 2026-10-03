import type {
  CardDefinition,
  CardInstance,
} from "../../../artifacts/ko-game/src/game/cards/types";
import type { GameEvent } from "../../../artifacts/ko-game/src/game/events/types";
import type { GameState } from "../../../artifacts/ko-game/src/game/types/game-state";
export type MatchMvp = {
  playerId: string;
  instanceId: string;
  definitionId: string;
  name: string;
  imageUrl: string | null;
  damage: number;
  kills: number;
  score: number;
};
export type MatchHighlight = {
  eventIndex: number;
  turn: number;
  kind: "FINISHER" | "QUEST" | "BIG_HIT" | "SURRENDER" | "FATIGUE";
  playerId: string | null;
  sourceName: string;
  amount: number | null;
};
export type MatchRecap = {
  mvp: MatchMvp | null;
  playerMvps: MatchMvp[];
  highlights: MatchHighlight[];
};
export const MVP_KILL_SCORE = 5;
/** Presentation only. Uses existing event provenance; never changes rules or rewards. */
export function buildMatchRecap(
  state: GameState,
  definitions: readonly CardDefinition[] = state.cardPool ?? [],
): MatchRecap {
  if (state.status !== "FINISHED")
    return { mvp: null, playerMvps: [], highlights: [] };
  const cards = new Map<
    string,
    { card: CardInstance; playerId: string; publicMetadata: boolean }
  >();
  for (const player of state.players)
    for (const card of [
      ...player.board,
      ...player.hand,
      ...player.deck,
      ...player.graveyard,
      ...player.removedFromGame,
    ])
      if (card && !card.instanceId.startsWith("__hidden__:"))
        cards.set(card.instanceId, {
          card,
          playerId: player.id,
          publicMetadata:
            player.board.includes(card) ||
            player.graveyard.includes(card) ||
            player.removedFromGame.includes(card),
        });
  const definitionsById = new Map(definitions.map((c) => [c.id, c]));
  const revealed = new Set<string>();
  const owners = new Map<string, string>();
  const stats = new Map<string, MatchMvp & { firstEvent: number }>();
  const damaged = new Map<
    string,
    { event: GameEvent; index: number; owner: string | undefined }
  >();
  const countedDeaths = new Set<string>();
  const highlights: MatchHighlight[] = [];
  let turn = 0;
  const damageHighlights: MatchHighlight[] = [];
  const sourceId = (event: GameEvent) =>
    event.source?.type === "CARD" ? event.source.cardInstanceId : undefined;
  const sourceOwner = (event: GameEvent) =>
    event.sourceContext?.sourcePlayerId ??
    event.sourceSnapshot?.playerId ??
    (event.source?.type === "PLAYER" ? event.source.playerId : undefined) ??
    (sourceId(event)
      ? (owners.get(sourceId(event)!) ?? cards.get(sourceId(event)!)?.playerId)
      : undefined) ??
    (event.type === "DAMAGE_DEALT" ? event.playerId : undefined);
  const targetOwner = (event: GameEvent) =>
    event.target?.type === "PLAYER"
      ? event.target.playerId
      : (event.targetSnapshot?.playerId ??
        (event.target?.type === "CARD"
          ? (owners.get(event.target.cardInstanceId) ??
            cards.get(event.target.cardInstanceId)?.playerId)
          : undefined));
  const name = (event: GameEvent) => {
    const id = sourceId(event);
    if (id && revealed.has(id)) {
      const entry = cards.get(id);
      const card = entry?.publicMetadata ? entry.card : undefined;
      return card
        ? (definitionsById.get(card.definitionId)?.name ?? "선수")
        : "선수";
    }
    if (id) return "효과";
    const owner = sourceOwner(event);
    return state.players.find((p) => p.id === owner)?.champion?.name ?? "효과";
  };
  const contribution = (
    id: string | undefined,
    owner: string | undefined,
    index: number,
  ) => {
    if (!id || !owner || !revealed.has(id)) return null;
    const entry = cards.get(id);
    if (
      !entry ||
      (entry.card.cardType ?? "WRESTLER") !== "WRESTLER" ||
      entry.card.isDirectDeployedChampion
    )
      return null;
    const key = `${owner}:${id}`;
    let row = stats.get(key);
    if (!row) {
      const d = definitionsById.get(entry.card.definitionId);
      row = {
        playerId: owner,
        instanceId: id,
        definitionId: entry.publicMetadata ? entry.card.definitionId : "",
        name: entry.publicMetadata ? (d?.name ?? "선수") : "공개되었던 선수",
        imageUrl: entry.publicMetadata ? (d?.imageUrl ?? null) : null,
        damage: 0,
        kills: 0,
        score: 0,
        firstEvent: index,
      };
      stats.set(key, row);
    }
    return row;
  };
  state.events.forEach((event, index) => {
    if (event.type === "TURN_STARTED") {
      turn++;
      damaged.clear();
    }
    if (
      (event.type === "ENTER_FIELD" || event.type === "CARD_PLAYED") &&
      event.cardInstanceId &&
      event.playerId
    ) {
      revealed.add(event.cardInstanceId);
      owners.set(event.cardInstanceId, event.playerId);
      damaged.delete(event.cardInstanceId);
      countedDeaths.delete(event.cardInstanceId);
    }
    if (
      event.type === "STAT_CHANGED" &&
      event.target?.type === "CARD" &&
      event.stat === "currentHealth" &&
      (event.delta ?? 0) > 0
    )
      damaged.delete(event.target.cardInstanceId);
    if (event.type === "DAMAGE_DEALT" && (event.amount ?? 0) > 0) {
      const owner = sourceOwner(event),
        target = targetOwner(event);
      if (owner && target && owner !== target) {
        const row = contribution(sourceId(event), owner, index);
        if (row) row.damage += event.amount!;
        damageHighlights.push({
          eventIndex: index,
          turn,
          kind: "BIG_HIT",
          playerId: owner,
          sourceName: name(event),
          amount: event.amount!,
        });
      }
      if (event.target?.type === "CARD")
        damaged.set(event.target.cardInstanceId, { event, index, owner });
    }
    if (
      (event.type === "CARD_RETIRED" || event.type === "CARD_DESTROYED") &&
      event.cardInstanceId &&
      !countedDeaths.has(event.cardInstanceId)
    ) {
      let source = event;
      const previous = damaged.get(event.cardInstanceId);
      if (
        !sourceId(event) &&
        previous &&
        index - previous.index <= 6 &&
        (event.targetSnapshot?.currentHealth ?? 1) <= 0
      )
        source = previous.event;
      const owner = sourceOwner(source),
        victim =
          event.targetSnapshot?.playerId ??
          event.playerId ??
          targetOwner(event);
      if (owner && victim && owner !== victim) {
        const row = contribution(sourceId(source), owner, index);
        if (row) row.kills++;
      }
      countedDeaths.add(event.cardInstanceId);
      damaged.delete(event.cardInstanceId);
    }
    if (event.type === "CHAMPION_QUEST_COMPLETED")
      highlights.push({
        eventIndex: index,
        turn,
        kind: "QUEST",
        playerId: event.playerId ?? null,
        sourceName:
          state.players.find((p) => p.id === event.playerId)?.champion?.name ??
          "챔피언",
        amount: null,
      });
  });
  const terminal = [...state.events]
    .map((event, index) => ({ event, index }))
    .reverse()
    .find(
      ({ event }) =>
        event.type === "SURRENDER" ||
        (event.type === "DAMAGE_DEALT" &&
          (event.amount ?? 0) > 0 &&
          ((event.target?.type === "PLAYER" &&
            event.target.playerId === state.loserId) ||
            (event.target?.type === "CARD" &&
              cards.get(event.target.cardInstanceId)?.card
                .isDirectDeployedChampion &&
              cards.get(event.target.cardInstanceId)?.playerId ===
                state.loserId))),
    );
  if (terminal) {
    const e = terminal.event;
    let kind: MatchHighlight["kind"] | null =
      e.type === "SURRENDER"
        ? "SURRENDER"
        : e.reason === "FATIGUE"
          ? "FATIGUE"
          : (state.players.find((p) => p.id === state.loserId)?.health ?? 1) <=
              0
            ? "FINISHER"
            : null;
    if (kind)
      highlights.unshift({
        eventIndex: terminal.index,
        turn: state.turn,
        kind,
        playerId:
          kind === "FINISHER" ? (sourceOwner(e) ?? null) : (e.playerId ?? null),
        sourceName: name(e),
        amount: e.type === "DAMAGE_DEALT" ? (e.amount ?? 0) : null,
      });
  }
  const ranked = [...stats.values()]
    .map((row) => ({ ...row, score: row.damage + row.kills * MVP_KILL_SCORE }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.damage - a.damage ||
        b.kills - a.kills ||
        a.firstEvent - b.firstEvent ||
        (a.instanceId < b.instanceId
          ? -1
          : a.instanceId > b.instanceId
            ? 1
            : 0),
    );
  const clean = (row: (typeof ranked)[number]): MatchMvp => {
    const { firstEvent, ...mvp } = row;
    return mvp;
  };
  const selected = highlights.slice(0, 3),
    used = new Set(selected.map((h) => h.eventIndex));
  for (const h of damageHighlights.sort(
    (a, b) => (b.amount ?? 0) - (a.amount ?? 0) || a.eventIndex - b.eventIndex,
  ))
    if (selected.length < 3 && !used.has(h.eventIndex)) {
      selected.push(h);
      used.add(h.eventIndex);
    }
  const playerMvps = state.players
    .map((p) => ranked.find((r) => r.playerId === p.id))
    .filter((r): r is (typeof ranked)[number] => Boolean(r))
    .map(clean);
  return {
    mvp: ranked[0] ? clean(ranked[0]) : null,
    playerMvps,
    highlights: selected,
  };
}
