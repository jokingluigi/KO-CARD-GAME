import type { ChampionState } from "@/game/champions/types";
import { describePreparationCondition } from "../lib/champion-preparation-progress";
export { championPreparationProgress } from "../lib/champion-preparation-progress";
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
                  : describePreparationCondition(o.condition, progress?.counts ?? {})}
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
