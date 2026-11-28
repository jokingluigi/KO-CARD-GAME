import type { GameEvent, GameState } from "@/game";
import {
  championPreparationProgress,
  describePreparationCondition,
} from "./champion-preparation-progress";

export interface PlayerMatchSummary {
  playerId: string;
  cardsPlayed: number;
  damageDealt: number;
  questCompleted: boolean;
  questProgress: number | null;
  questRequired: number | null;
  preparationAtEnd: string;
  finishersPlayed: number;
}

function cardOwner(state: GameState, instanceId: string): string | undefined {
  return state.players.find((player) =>
    [
      ...player.board,
      ...player.hand,
      ...player.deck,
      ...player.graveyard,
      ...player.removedFromGame,
    ].some((card) => card?.instanceId === instanceId),
  )?.id;
}

function damageSourcePlayer(
  state: GameState,
  event: GameEvent,
): string | undefined {
  if (event.sourceContext?.sourcePlayerId)
    return event.sourceContext.sourcePlayerId;
  if (event.sourceSnapshot?.playerId) return event.sourceSnapshot.playerId;
  if (event.source?.type === "PLAYER") return event.source.playerId;
  if (event.source?.type === "CARD")
    return cardOwner(state, event.source.cardInstanceId);
  return undefined;
}

export function matchSummary(state: GameState): PlayerMatchSummary[] {
  return state.players.map((player) => {
    const champion = player.champion;
    const progress = champion?.quest
      ? championPreparationProgress(champion)
      : null;
    const choices = champion?.quest?.finisherChoices;
    const finisherIds = new Set(
      [
        champion?.quest?.finisher?.cardDefinitionId,
        ...(choices?.map((choice) => choice.cardDefinitionId) ?? []),
        champion?.quest?.reward.type === "FINISHER"
          ? champion.quest.reward.cardDefinitionId
          : undefined,
      ].filter((id): id is string => Boolean(id)),
    );
    return {
      playerId: player.id,
      cardsPlayed: state.events.filter(
        (event) => event.type === "CARD_PLAYED" && event.playerId === player.id,
      ).length,
      damageDealt: state.events.reduce((sum, event) => {
        if (
          event.type !== "DAMAGE_DEALT" ||
          damageSourcePlayer(state, event) !== player.id
        )
          return sum;
        return sum + Math.max(0, event.amount ?? 0);
      }, 0),
      questCompleted: Boolean(
        player.champion?.questCompleted ||
        state.events.some(
          (event) =>
            event.type === "CHAMPION_QUEST_COMPLETED" &&
            event.playerId === player.id,
        ),
      ),
      questProgress: progress?.current ?? null,
      questRequired: progress?.required ?? null,
      preparationAtEnd: choices?.length
        ? choices
            .map((choice) => {
              const saved = champion!.finisherProgress?.[choice.id];
              const status =
                champion!.selectedFinisherId === choice.id
                  ? "획득 완료"
                  : champion!.selectedFinisherId
                    ? "비활성"
                    : saved?.completed
                      ? "준비 완료"
                      : describePreparationCondition(
                          choice.condition,
                          saved?.counts ?? {},
                        );
              return `${choice.name}: ${status}`;
            })
            .join(" · ")
        : progress
          ? `${progress.current}/${progress.required}`
          : "없음",
      // Count actual casts, not preparation/reward events or lethal-hit highlights.
      finishersPlayed: state.events.filter(
        (event) =>
          event.type === "CARD_PLAYED" &&
          event.playerId === player.id &&
          (event.reason === "FINISHER_AUTO_CAST" ||
            Boolean(
              event.cardDefinitionId && finisherIds.has(event.cardDefinitionId),
            )),
      ).length,
    };
  });
}

export function matchEndReason(
  state: GameState,
  viewerPlayerId: string,
): string {
  const terminalEvent = [...state.events]
    .reverse()
    .find(
      (event) =>
        event.type === "SURRENDER" ||
        (event.type === "DAMAGE_DEALT" &&
          (event.amount ?? 0) > 0 &&
          ((event.target?.type === "PLAYER" &&
            event.target.playerId === state.loserId) ||
            (event.reason === "FATIGUE" && event.playerId === state.loserId))),
    );

  if (terminalEvent?.type === "SURRENDER") {
    return terminalEvent.playerId === viewerPlayerId
      ? "항복으로 매치가 종료되었습니다."
      : "상대의 항복으로 매치가 종료되었습니다.";
  }
  if (terminalEvent?.reason === "FATIGUE")
    return "덱 소진으로 매치가 종료되었습니다.";
  if (terminalEvent?.reason === "BASIC_ATTACK")
    return "직접 공격으로 매치가 종료되었습니다.";
  if (terminalEvent?.type === "DAMAGE_DEALT")
    return "카드 효과로 매치가 종료되었습니다.";
  return "매치 결과가 확정되었습니다.";
}
