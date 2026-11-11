import type { ChampionState } from "@/game/champions/types";
import type { ChampionQuestCondition } from "../../../../lib/game-engine/src/champion-quest-conditions";
function describe(
  node: ChampionQuestCondition,
  counts: Record<string, number>,
  path = "root",
): string {
  if (node.type === "EVENT") return `${counts[path] ?? 0}/${node.required}`;
  if (node.type === "TURN") return `${node.turn}턴 도달`;
  if (node.type === "HEALTH")
    return `${node.owner === "SELF" ? "내" : "상대"} 체력 ${node.op === "LTE" ? "≤" : node.op === "GTE" ? "≥" : node.op === "LT" ? "<" : node.op === "GT" ? ">" : "="} ${node.value}`;
  if(node.type==='ZONE_COUNT')return `${counts[path]??0}/${node.required}장`;
  return node.conditions
    .map((child, i) => describe(child, counts, `${path}.${i}`))
    .join(node.type === "ALL" ? " · " : " / ");
}
export function FinisherProgress({
  champion,
  compact = false,
}: {
  champion: ChampionState;
  compact?: boolean;
}) {
  const options = champion.quest?.finisherChoices ?? [];
  return (
    <div className={compact ? "space-y-0.5" : "space-y-3"}>
      {options.map((o) => {
        const progress = champion.finisherProgress?.[o.id],
          selected = champion.selectedFinisherId === o.id,
          disabled = Boolean(champion.selectedFinisherId && !selected);
        return (
          <div key={o.id} className={disabled ? "opacity-40" : ""}>
            <strong>{o.name}</strong> ·{" "}
            {selected
              ? "획득 완료"
              : disabled
                ? "비활성"
                : progress?.completed
                  ? "준비 완료"
                  : describe(o.condition, progress?.counts ?? {})}
            {!compact && (
              <p className="mt-1 whitespace-pre-line text-sm text-neutral-300">
                {o.description}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function championPreparationProgress(champion:ChampionState):{current:number;required:number}{
 const condition=champion.quest?.condition;
 if(condition?.type==='EVENT'||condition?.type==='ZONE_COUNT')return {current:Math.min(condition.required,champion.questConditionCounts?.root??(champion.questCompleted?condition.required:0)),required:condition.required};
 return {current:champion.questProgress,required:champion.quest?.requiredProgress??1};
}
