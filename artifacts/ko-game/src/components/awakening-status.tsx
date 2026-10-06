import type { ChampionState } from "../game/champions/types";

export function AwakeningStatus({
  champion,
}: {
  champion: ChampionState | null;
}) {
  const sequence = champion?.awakening;
  if (!sequence) return null;
  const stage =
    sequence.stage === "TANK" ? 1 : sequence.stage === "HEALER" ? 2 : 3;
  return (
    <div
      role="status"
      aria-label="위기 각성 상태"
      className="flex max-w-full flex-wrap items-center gap-1 rounded border border-amber-500/70 bg-amber-950/90 px-2 py-1 text-[9px] font-bold leading-tight text-amber-100 md:text-xs"
    >
      {sequence.sequenceActive ? (
        <>
          <span>
            {sequence.pendingStage
              ? "소환 대기 · 무적 보류"
              : sequence.championInvulnerable
                ? "무적"
                : "각성"}
          </span>
          <span>각성 {stage}/3</span>
        </>
      ) : (
        <span>각성 종료</span>
      )}
      <span>각성 +{sequence.awakeningPower}</span>
    </div>
  );
}
