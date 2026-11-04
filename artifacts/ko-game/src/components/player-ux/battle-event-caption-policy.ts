import type { GameState, GameEvent } from "@/game";
import { eventTitle, observedChampionHealing } from "../action-history-utils";
/** One committed public event, no backlog and no hidden hand/deck names. */
export function battleEventCaption(
  before: GameState,
  after: GameState,
): string | null {
  if (
    before.gameId !== after.gameId ||
    after.events.length < before.events.length
  )
    return null;
  if (before.status !== "FINISHED" && after.status === "FINISHED")
    return after.winnerId === after.players[0].id
      ? "승리 확정"
      : after.winnerId
        ? "패배 확정"
        : "대전 종료";
  if (after.status !== "IN_PROGRESS") return null;
  const events = after.events.slice(before.events.length);
  const rank = (e: GameEvent) =>
    e.type === "CHAMPION_QUEST_COMPLETED"
      ? 8
      : e.type === "DAMAGE_DEALT" &&
          (e.amount ?? 0) > 0 &&
          e.target?.type === "PLAYER"
        ? 7
        : e.type === "CHAMPION_QUEST_PROGRESS"
          ? 6
          : e.type === "CHAMPION_ABILITY_USED"
            ? 5
            : e.type === "CARD_DESTROYED" ||
                e.type === "CARD_RETIRED" ||
                e.type === "CARD_VANISHED"
              ? 4
              : e.type === "ENTER_FIELD"
                ? 3
                : e.type === "CARD_PLAYED"
                  ? 2
                  : e.type === "TURN_STARTED"
                    ? 1
                    : 0;
  const important = events.reduce<GameEvent | null>(
    (best, e) =>
      rank(e) > 0 && rank(e) >= rank(best ?? { type: "GOLD_CHANGED" })
        ? e
        : best,
    null,
  );
  const healing = observedChampionHealing(before, after);
  if (healing.length && (!important || rank(important) < 7)) {
    const h = healing.at(-1)!;
    return `${h.playerId === after.players[0].id ? "내" : "상대"} 챔피언 체력 +${h.amount} 회복`;
  }
  if (!important) return null;
  const owner =
    important.target?.type === "PLAYER" && important.type === "DAMAGE_DEALT"
      ? important.target.playerId
      : (important.playerId ?? important.sourceContext?.sourcePlayerId);
  const who =
    owner === after.players[0].id
      ? "내"
      : owner === after.players[1].id
        ? "상대"
        : null;
  if (important.type === "DAMAGE_DEALT")
    return `${who ?? ""} 챔피언 ${important.amount} 피해`;
  if (important.type === "TURN_STARTED")
    return who === "내" ? "내 턴 시작" : "상대 턴 시작";
  if (important.type === "CHAMPION_QUEST_PROGRESS") {
    const champion = after.players.find((p) => p.id === owner)?.champion;
    return `${who ?? ""} 피니셔 준비 ${champion?.questProgress ?? ""}${champion?.quest?.requiredProgress ? `/${champion.quest.requiredProgress}` : ""}`.trim();
  }
  return `${who ? who + " · " : ""}${eventTitle(after, important, after.players[0].id)}`;
}
