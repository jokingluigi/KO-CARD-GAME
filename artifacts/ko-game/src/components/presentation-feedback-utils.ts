import { damageNumberDuration } from './presentation-policy';
import type { EventSubject, GameEvent } from "@/game/events/types";

export type PresentationCueKind =
  | "EFFECT"
  | "SILENCE"
  | "ARMOR"
  | "DAMAGE"
  | "DODGE"
  | "BLOCK"
  | "HEAL"
  | "BUFF"
  | "DEBUFF"
  | "RETIRE"
  | "DESTROY"
  | "REMOVE"
  | "DRAW"
  | "GENERATE"
  | "TRANSFORM"
  | "QUEST_PROGRESS"
  | "QUEST_COMPLETE"
  | "GOLD"
  | "TURN";

export type PresentationCueDraft = {
  id: string;
  kind: PresentationCueKind;
  label: string;
  value?: number;
  cardInstanceId?: string;
  playerId?: string;
  championId?: string;
  sourceCardInstanceId?: string;
  duration: number;
  combat?: boolean;
};

/** Cosmetic feedback must not hold the AI turn or legal player input. */
export function presentationBlocksActions(cues: PresentationCueDraft[]): boolean {
  return cues.some(cue => cue.kind === 'QUEST_COMPLETE' || cue.kind === 'TRANSFORM');
}

/** Deck buffs still resolve, but offscreen stat popups have no visible target. */
export function visibleStatFeedback(cue: PresentationCueDraft, visibleCardIds: Set<string>): boolean {
  return !cue.cardInstanceId || !['BUFF', 'HEAL', 'DEBUFF', 'EFFECT', 'SILENCE', 'ARMOR'].includes(cue.kind) || visibleCardIds.has(cue.cardInstanceId);
}

/** Stable within a match even when the same event payload occurs more than once. */
export function presentationEventKey(event: GameEvent, index: number, _events: GameEvent[]): string {
  const subjectKey = (subject: EventSubject | undefined) => {
    if (!subject) return "";
    if (subject.type === "CARD") return `CARD:${subject.cardInstanceId}`;
    if (subject.type === "PLAYER") return `PLAYER:${subject.playerId}`;
    if (subject.type === "CHAMPION") return `CHAMPION:${subject.championId}`;
    return "SYSTEM";
  };
  return [
    index,
    event.type,
    event.playerId ?? "",
    event.cardInstanceId ?? "",
    event.championId ?? "",
    event.reason ?? "",
    event.amount ?? "",
    event.stat ?? "",
    event.delta ?? "",
    subjectKey(event.target),
    subjectKey(event.source),
  ].join(":");
}

function targetIds(event: GameEvent) {
  const target = event.target;
  if (target?.type === "CARD") return { cardInstanceId: target.cardInstanceId };
  if (target?.type === "PLAYER") return { playerId: target.playerId };
  if (target?.type === "CHAMPION") return { championId: target.championId };
  if (event.cardInstanceId) return { cardInstanceId: event.cardInstanceId };
  if (event.playerId) return { playerId: event.playerId };
  return {};
}

export function presentationCueDrafts(
  events: GameEvent[],
  startIndex: number,
  eventKeys?: string[],
  viewerPlayerId?: string,
) {
  const drafts: PresentationCueDraft[] = [];

  events.slice(startIndex).forEach((event, offset) => {
    const id = eventKeys?.[startIndex + offset] ??
      `${startIndex + offset}:${event.type}:${event.cardInstanceId ?? ""}:${event.championId ?? ""}`;
    const target = targetIds(event);
    switch (event.type) {
      case "DAMAGE_DEALT":
        if (event.tags?.includes('BLOCKED')) {
          drafts.push({ id, kind: 'BLOCK', label: '무효', sourceCardInstanceId: event.source?.type === 'CARD' ? event.source.cardInstanceId : undefined, ...target, duration: 320 });
        } else if (event.reason === "DODGE" || event.tags?.includes("DODGE")) {
          drafts.push({
            id,
            kind: "DODGE",
            label: "DODGE",
            sourceCardInstanceId: event.source?.type === 'CARD' ? event.source.cardInstanceId : undefined,
            ...target,
            duration: 280,
          });
        } else if ((event.amount ?? 0) > 0) {
          drafts.push({
            id,
            kind: "DAMAGE",
            combat: event.reason === 'COMBAT' || event.reason === 'BASIC_ATTACK',
            label: `-${event.amount}`,
            value: event.amount,
            sourceCardInstanceId: event.source?.type === 'CARD' ? event.source.cardInstanceId : undefined,
            ...target,
            duration: damageNumberDuration(event.amount ?? 0),
          });
        }
        break;
      case "CHAMPION_ABILITY_USED":
        drafts.push({id,kind:"EFFECT",label:"능력",championId:event.championId,playerId:event.playerId,duration:180});
        break;
      case "STAT_CHANGED":
        if ((event.delta ?? 0) !== 0) {
          const delta = event.delta ?? 0;
          drafts.push({
            id,
            kind: delta > 0
              ? event.stat === "health" || event.stat === "currentHealth" ? "HEAL" : "BUFF"
              : "DEBUFF",
            label: `${event.stat === "attack" ? "공격력" : event.stat === "cost" ? "비용" : "체력"} ${delta > 0 ? "+" : ""}${delta}`,
            value: delta,
            sourceCardInstanceId: event.source?.type === "CARD" ? event.source.cardInstanceId : undefined,
            ...target,
            duration: 320,
          });
        }
        break;
      case "CARD_RETIRED":
        drafts.push({ id, kind: "RETIRE", label: "RETIRE", ...target, duration: 400 });
        break;
      case "CARD_DESTROYED":
        drafts.push({ id, kind: "DESTROY", label: "파괴", sourceCardInstanceId: event.source?.type === "CARD" ? event.source.cardInstanceId : undefined, ...target, duration: 490 });
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
        drafts.push({ id, kind: "GENERATE", label: "생성", sourceCardInstanceId: event.source?.type === "CARD" ? event.source.cardInstanceId : undefined, ...target, duration: 460 });
        break;
      case "CARD_TRANSFORMED":
        drafts.push({ id, kind: "TRANSFORM", label: "변신", sourceCardInstanceId: event.source?.type === "CARD" ? event.source.cardInstanceId : undefined, ...target, duration: 660 });
        break;
      case "CHAMPION_QUEST_PROGRESS":
        drafts.push({
          id,
          kind: "QUEST_PROGRESS",
          label: "QUEST",
          value: event.amount,
          ...target,
          playerId: event.playerId ?? target.playerId,
          duration: 1500,
        });
        break;
      case "CHAMPION_QUEST_COMPLETED":
        drafts.push({
          id,
          kind: "QUEST_COMPLETE",
          label: "QUEST COMPLETE",
          ...target,
          playerId: event.playerId ?? target.playerId,
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
      case "TURN_STARTED":
        drafts.push({
          id,
          kind: "TURN",
          label: viewerPlayerId && event.playerId === viewerPlayerId ? "YOUR TURN" : "TURN START",
          ...target,
          duration: 620,
        });
        break;
      default:
        break;
    }
  });

  return drafts;
}
