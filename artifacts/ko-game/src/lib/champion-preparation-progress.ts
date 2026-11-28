import type { ChampionState } from "../game/champions/types";
import type { ChampionQuestCondition } from "../../../../lib/game-engine/src/champion-quest-conditions";

export function describePreparationCondition(
  node: ChampionQuestCondition,
  counts: Record<string, number>,
  path = "root",
): string {
  if (node.type === "EVENT") return `${counts[path] ?? 0}/${node.required}`;
  if (node.type === "TURN") return `${node.turn}턴 도달`;
  if (node.type === "HEALTH")
    return `${node.owner === "SELF" ? "내" : "상대"} 체력 ${node.op === "LTE" ? "≤" : node.op === "GTE" ? "≥" : node.op === "LT" ? "<" : node.op === "GT" ? ">" : "="} ${node.value}`;
  if (node.type === "ZONE_COUNT")
    return `${counts[path] ?? 0}/${node.required}장`;
  return node.conditions
    .map((child, i) =>
      describePreparationCondition(child, counts, `${path}.${i}`),
    )
    .join(node.type === "ALL" ? " · " : " / ");
}
export function championPreparationProgress(champion: ChampionState): {
  current: number;
  required: number;
} {
  const condition = champion.quest?.condition;
  if (condition?.type === "EVENT" || condition?.type === "ZONE_COUNT")
    return {
      current: Math.min(
        condition.required,
        champion.questConditionCounts?.root ??
          (champion.questCompleted ? condition.required : 0),
      ),
      required: condition.required,
    };
  return {
    current: champion.questProgress,
    required: champion.quest?.requiredProgress ?? 1,
  };
}
