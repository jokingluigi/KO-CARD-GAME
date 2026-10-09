import {
  ACTIONS,
  ACTION_SCHEMAS,
  DISPLAY_LABELS,
  type StructuredTarget,
} from "@workspace/effect-registry";
import type { GameEventType } from "../../../../artifacts/ko-game/src/game/events/types";
export const TOWER_EFFECT_EVENTS = [
  "BATTLE_START",
  "TURN_STARTED",
  "TURN_ENDED",
  "CARD_PLAYED",
  "ENTER_FIELD",
  "ATTACK_DECLARED",
  "CARD_RETIRED",
  "CARD_DESTROYED",
  "CARD_VANISHED",
  "FUSION",
  "DAMAGE_DEALT",
  "CHAMPION_ABILITY_USED",
  "CHAMPION_QUEST_COMPLETED",
] as const;
export type TowerEffectCondition =
  | { type: "ALL" | "ANY"; conditions: TowerEffectCondition[] }
  | {
      type: "NUMBER";
      field:
        | "TURN"
        | "CHAMPION_HP"
        | "GOLD"
        | "FIELD_COUNT"
        | "CARD_ATK"
        | "CARD_HP"
        | "CARD_COST"
        | "EVENT_COUNT";
      compare: "EQ" | "GTE" | "LTE";
      value: number;
      event?: GameEventType;
    }
  | { type: "CARD_TAG" | "CARD_KEYWORD" | "RELIC"; id: string };
export interface TowerConfiguredEffect {
  id: string;
  name: string;
  iconUrl?: string;
  enabled: boolean;
  event: (typeof TOWER_EFFECT_EVENTS)[number];
  eventOwner: "SELF" | "ENEMY" | "ANY";
  condition?: TowerEffectCondition;
  action: (typeof ACTIONS)[number];
  target?: StructuredTarget;
  values: Record<string, unknown>;
  priority: number;
  duration: "BATTLE" | "RUN";
  limit: { scope: "UNLIMITED" | "TURN" | "BATTLE" | "RUN"; count: number };
}
const excluded = new Set([
  "PREVENT_DAMAGE",
  "PREVENT_RETIRE",
  "REGISTER_DELAYED",
  "REGISTER_LISTENER",
  "QUEUE_EFFECT",
  "REPEAT_TURN_END",
  "SWITCH_EFFECT_BRANCH",
  "CAPTURE",
  "RELEASE_CAPTURED",
  "SPEND_GOLD_BUFF_SELF",
  "TRANSFORM_SOURCE",
  "COPY_BEST_STATS",
  "ADD_AGGREGATED_ATTACK",
  "GRANT_RANDOM_CARD_TEXT",
]);
export function towerEffectTargetZones(action: string): string[] {
  if (["DAMAGE", "HEAL"].includes(action))
    return ["BOARD", "PLAYER", "CHARACTER"];
  if (action === "REVIVE") return ["GRAVEYARD"];
  if (action === "MILL") return ["DECK"];
  if (
    [
      "BUFF",
      "SET_STATS",
      "MODIFY_STAT",
      "MODIFY_MAX_HEALTH",
      "SET_STAT",
      "SWAP_STATS",
      "REDUCE_COST",
      "INCREASE_COST",
      "HEAL",
    ].includes(action)
  )
    return ["BOARD", "HAND", "DECK"];
  if (
    ["MOVE_TO_HAND", "MOVE_TO_DECK", "VANISH", "REMOVE_FROM_GAME"].includes(
      action,
    )
  )
    return ["BOARD", "HAND", "DECK", "GRAVEYARD"];
  return ["BOARD"];
}
export const TOWER_EFFECT_LIBRARY = ACTIONS.filter(
  (action) => !excluded.has(action),
).map((action) => ({
  effect_type: action,
  handler_id: "CARD_ENGINE:" + action + ":v1",
  parameter_schema: ACTION_SCHEMAS[action],
  supported_triggers: TOWER_EFFECT_EVENTS,
  supported_targets: ACTION_SCHEMAS[action].target
    ? towerEffectTargetZones(action)
    : [],
  validation_rules: "SHARED_EFFECT_REGISTRY",
  description_template: action,
  execution_handler: action,
}));
const labels: Record<string, string> = {
  BUFF: "능력치 변경",
  DAMAGE: "피해",
  HEAL: "회복",
  DRAW: "드로우",
  ADD_GOLD: "골드 획득",
  SUMMON: "소환",
  ADD_KEYWORD: "키워드 부여",
  REMOVE_KEYWORD: "키워드 제거",
  DESTROY: "파괴",
  RETIRE: "리타이어",
  VANISH: "소멸",
  GENERATE: "카드 생성",
  REDUCE_COST: "비용 감소",
  INCREASE_COST: "비용 증가",
};
const events: Record<string, string> = {
  BATTLE_START: "전투 시작",
  TURN_STARTED: "턴 시작",
  TURN_ENDED: "턴 종료",
  ENTER_FIELD: "선수 등장",
  CARD_PLAYED: "카드 사용",
  CARD_RETIRED: "리타이어",
  CARD_DESTROYED: "파괴",
  CARD_VANISHED: "소멸",
  FUSION: "합체",
  ATTACK_DECLARED: "공격 선언",
  DAMAGE_DEALT: "피해 발생",
  CHAMPION_ABILITY_USED: "챔피언 능력 사용",
  CHAMPION_QUEST_COMPLETED: "챔피언 퀘스트 완료",
};
const conditionLabels: Record<string, string> = {
  TURN: "턴",
  CHAMPION_HP: "내 챔피언 체력",
  GOLD: "내 골드",
  FIELD_COUNT: "내 필드 선수 수",
  CARD_ATK: "해당 선수 공격력",
  CARD_HP: "해당 선수 체력",
  CARD_COST: "해당 카드 비용",
  EVENT_COUNT: "전투 내 행동 횟수",
};
function conditionText(c: TowerEffectCondition): string {
  if (c.type === "ALL" || c.type === "ANY")
    return (
      "(" +
      c.conditions
        .map(conditionText)
        .join(c.type === "ALL" ? " 그리고 " : " 또는 ") +
      ")"
    );
  if (c.type === "NUMBER")
    return (
      (conditionLabels[c.field] ?? c.field) +
      (c.event ? " [" + (events[c.event] ?? c.event) + "]" : "") +
      " " +
      c.value +
      " " +
      { EQ: "일 때", GTE: "이상", LTE: "이하" }[c.compare]
    );
  if (!("id" in c)) return "";
  return c.type === "RELIC"
    ? "유물 [" + c.id + "] 보유"
    : c.type === "CARD_TAG"
      ? "해당 카드의 태그 [" + c.id + "]"
      : "해당 카드의 키워드 [" + c.id + "]";
}
export function describeTowerEffect(effect: TowerConfiguredEffect): string {
  const t = effect.target,
    v = effect.values,
    zone: Record<string, string> = {
      BOARD: "필드 선수",
      HAND: "손패 카드",
      DECK: "덱 카드",
      GRAVEYARD: "묘지 카드",
      PLAYER: "챔피언",
      CHARACTER: "캐릭터",
    },
    owner: Record<string, string> = { SELF: "내", ENEMY: "상대", ALL: "양측" },
    selection: Record<string, string> = {
      ALL: "전체",
      RANDOM: "무작위",
      TOP: "조건 순위 상위",
      SELF: "해당 카드",
    };
  const target = t
    ? owner[t.owner ?? "SELF"] +
      " " +
      (zone[t.zone ?? "BOARD"] ?? t.zone) +
      " " +
      (selection[t.selection ?? "ALL"] ?? t.selection) +
      (t.selection === "RANDOM" || t.selection === "TOP"
        ? " " + (t.count ?? 1) + "장"
        : "")
    : "내";
  const numeric = v.amount !== undefined ? String(v.amount) : "";
  const detail =
    effect.action === "BUFF" || effect.action === "SET_STATS"
      ? [
          v.attack !== undefined ? "공격력 " + v.attack : undefined,
          v.health !== undefined ? "체력 " + v.health : undefined,
        ]
          .filter(Boolean)
          .join(" / ")
      : [
          v.stat
            ? ({ ATTACK: "공격력", HEALTH: "체력", COST: "비용" }[
                String(v.stat)
              ] ?? v.stat)
            : "",
          numeric,
          v.keyword
            ? ((DISPLAY_LABELS as any)[String(v.keyword)] ?? v.keyword)
            : "",
          v.definitionRef
            ? "카드 [" +
              ((v.definitionRef as { name?: string; id?: string }).name ??
                (v.definitionRef as { id?: string }).id) +
              "]"
            : "",
          v.count ? "×" + v.count : "",
          v.destination ? "→ " + v.destination : "",
        ]
          .filter(Boolean)
          .join(" ");
  return (
    (events[effect.event] ??
      (DISPLAY_LABELS as any)[effect.event] ??
      effect.event) +
    " (" +
    (owner[effect.eventOwner] ?? "양측") +
    " 이벤트)" +
    (effect.condition ? " · " + conditionText(effect.condition) : "") +
    ": " +
    target +
    " " +
    (labels[effect.action] ??
      (DISPLAY_LABELS as any)[effect.action] ??
      effect.action) +
    " " +
    detail +
    " · " +
    (effect.duration === "RUN" ? "런 지속" : "전투 한정") +
    " · " +
    (effect.limit.scope === "UNLIMITED"
      ? "무제한"
      : { TURN: "턴당", BATTLE: "전투당", RUN: "런당" }[effect.limit.scope] +
        " " +
        effect.limit.count +
        "회") +
    " · 우선순위 " +
    effect.priority
  );
}
