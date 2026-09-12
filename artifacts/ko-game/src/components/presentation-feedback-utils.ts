import type { GameEvent } from "@/game/events/types";

export type PresentationCueKind =
  | "DAMAGE"
  | "HEAL"
  | "BUFF"
  | "DEBUFF"
  | "RETIRE"
  | "DESTROY"
  | "REMOVE"
  | "DRAW"
  | "GENERATE"
  | "QUEST_PROGRESS"
  | "QUEST_COMPLETE"
  | "GOLD";

export type PresentationCueDraft = {
  id: string;
  kind: PresentationCueKind;
  label: string;
  value?: number;
  cardInstanceId?: string;
  playerId?: string;
  championId?: string;
  duration: number;
};

function targetIds(event: GameEvent) {
  const target = event.target;
  if (target?.type === "CARD") return { cardInstanceId: target.cardInstanceId };
  if (target?.type === "PLAYER") return { playerId: target.playerId };
  if (target?.type === "CHAMPION") return { championId: target.championId };
  if (event.cardInstanceId) return { cardInstanceId: event.cardInstanceId };
  if (event.playerId) return { playerId: event.playerId };
  return {};
}

export function presentationCueDrafts(events: GameEvent[], startIndex: number) {
  const drafts: PresentationCueDraft[] = [];

  events.slice(startIndex).forEach((event, offset) => {
    const id = `${startIndex + offset}:${event.type}:${event.cardInstanceId ?? ""}:${event.championId ?? ""}`;
    const target = targetIds(event);
    switch (event.type) {
      case "DAMAGE_DEALT":
        if ((event.amount ?? 0) > 0) {
          drafts.push({
            id,
            kind: "DAMAGE",
            label: `-${event.amount}`,
            value: event.amount,
            ...target,
            duration: 320,
          });
        }
        break;
      case "CARD_RETIRED":
        drafts.push({ id, kind: "RETIRE", label: "RETIRE", ...target, duration: 400 });
        break;
      case "CARD_DESTROYED":
        drafts.push({ id, kind: "DESTROY", label: "DESTROY", ...target, duration: 360 });
        break;
      case "CARD_REMOVED":
        drafts.push({
          id,
          kind: "REMOVE",
          label: event.reason === "OVERDRAW" ? "OVERDRAW" : "REMOVED",
          ...target,
          duration: 300,
        });
        break;
      case "CARD_DRAWN":
        drafts.push({ id, kind: "DRAW", label: "DRAW", ...target, duration: 260 });
        break;
      case "CARD_GENERATED":
        drafts.push({ id, kind: "GENERATE", label: "GENERATED", ...target, duration: 280 });
        break;
      case "CHAMPION_QUEST_PROGRESS":
        drafts.push({
          id,
          kind: "QUEST_PROGRESS",
          label: "QUEST",
          value: event.amount,
          ...target,
          duration: 360,
        });
        break;
      case "CHAMPION_QUEST_COMPLETED":
        drafts.push({
          id,
          kind: "QUEST_COMPLETE",
          label: "QUEST COMPLETE",
          ...target,
          duration: 820,
        });
        break;
      case "GOLD_CHANGED":
        if ((event.amount ?? 0) !== 0) {
          drafts.push({
            id,
            kind: "GOLD",
            label: event.amount! > 0 ? `+${event.amount}` : `${event.amount}`,
            value: event.amount,
            ...target,
            duration: 260,
          });
        }
        break;
      default:
        break;
    }
  });

  return drafts;
}