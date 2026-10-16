import { cancelledUsageEvents } from "./usage-statistics-observer";
import type { GameState } from "@workspace/game-engine";

export type UsageStart = {
  version: 1;
  startedAt: string;
  decks: Record<string, string[] | null>;
  champions?: Record<string, string>;
  diagnostic?: boolean;
};
export type UsageCard = {
  id: string;
  deckCopies: number;
  plays: number;
  generated: number;
  summons: number;
};
export type UsageParticipant = {
  seat: string;
  championId: string;
  outcome: "WIN" | "LOSS" | "DRAW";
  deckKnown: boolean;
  abilityUses: number;
  questEligible: boolean;
  questCompleted: boolean;
  questTurn: number | null;
  cards: UsageCard[];
};
export type UsageSummary = {
  version: 1;
  matchId: string;
  startedAt: string;
  endedAt: string;
  diagnostic: boolean;
  participants: UsageParticipant[];
  unresolvedEvents: number;
};

/** Called only on trusted server states. Never accepts counters or winners from an HTTP payload. */
export function summarizeUsage(
  state: GameState,
  start: UsageStart | null | undefined,
  endedAt = new Date(),
  humanSeats?: readonly string[],
): UsageSummary | null {
  if (
    !start ||
    start.version !== 1 ||
    state.status !== "FINISHED" ||
    !Number.isFinite(Date.parse(start.startedAt))
  )
    return null;
  const cancelled = cancelledUsageEvents(state);
  let unresolvedEvents = 0;
  const participants = state.players
    .filter((p) => p.champion && (!humanSeats || humanSeats.includes(p.id)))
    .map((p) => {
      const cards = new Map<string, UsageCard>();
      const get = (id: string) => {
        let row = cards.get(id);
        if (!row) {
          row = { id, deckCopies: 0, plays: 0, generated: 0, summons: 0 };
          cards.set(id, row);
        }
        return row;
      };
      const deck = start.decks[p.id];
      if (Array.isArray(deck)) for (const id of deck) get(id).deckCopies++;
      let abilityUses = 0,
        questCompleted = false,
        questTurn: number | null = null;
      for (const [index, event] of state.events.entries()) {
        if (cancelled.has(index)) continue;
        if (event.playerId !== p.id) continue;
        if (event.type === "CHAMPION_ABILITY_USED") abilityUses++;
        if (event.type === "CHAMPION_QUEST_COMPLETED" && !questCompleted) {
          questCompleted = true;
          questTurn = typeof event.turn === "number" ? event.turn : null;
        }
        const counter =
          event.type === "CARD_PLAYED" && event.reason === "PLAY_FROM_HAND"
            ? "plays"
            : event.type === "CARD_GENERATED"
              ? "generated"
              : event.type === "ENTER_FIELD"
                ? "summons"
                : null;
        if (!counter) continue;
        // Future events carry explicit IDs, so transforms/removal cannot rewrite earlier uses.
        const id = event.cardDefinitionId;
        if (!id) {
          unresolvedEvents++;
          continue;
        }
        get(id)[counter]++;
      }
      return {
        seat: p.id,
        championId: start.champions?.[p.id] ?? p.champion!.id,
        outcome:
          state.winnerId === p.id
            ? ("WIN" as const)
            : state.winnerId
              ? ("LOSS" as const)
              : ("DRAW" as const),
        deckKnown: Array.isArray(deck),
        abilityUses,
        questEligible: Boolean(p.champion!.quest),
        questCompleted,
        questTurn,
        cards: [...cards.values()],
      };
    });
  return {
    version: 1,
    matchId: state.gameId,
    startedAt: start.startedAt,
    endedAt: endedAt.toISOString(),
    diagnostic: start.diagnostic === true,
    participants,
    unresolvedEvents,
  };
}
