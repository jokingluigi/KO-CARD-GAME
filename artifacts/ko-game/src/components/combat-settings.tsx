import { useState } from "react";
import {
  readCombatPreferences,
  saveCombatPreferences,
  type CombatPreferences,
} from "./combat-preferences";
export function CombatSettings() {
  const [value, setValue] = useState(readCombatPreferences);
  const update = (patch: Partial<CombatPreferences>) => {
    const next = { ...value, ...patch };
    setValue(next);
    saveCombatPreferences(next);
  };
  const style =
    "min-h-11 border border-neutral-700 bg-neutral-950 px-2 text-white";
  return (
    <fieldset className="space-y-2 border-t border-neutral-700 pt-3 text-xs">
      <legend className="font-bold text-amber-200">전투 연출</legend>
      <label className="flex items-center justify-between gap-2">
        그래픽 품질
        <select
          aria-label="그래픽 품질"
          className={style}
          value={value.quality}
          onChange={(e) =>
            update({ quality: e.target.value as CombatPreferences["quality"] })
          }
        >
          <option value="LOW">낮음</option>
          <option value="MEDIUM">보통</option>
          <option value="HIGH">높음</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        타격 연출 강도
        <select
          aria-label="타격 연출 강도"
          className={style}
          value={value.intensity}
          onChange={(e) =>
            update({
              intensity: e.target.value as CombatPreferences["intensity"],
            })
          }
        >
          <option value="STANDARD">표준</option>
          <option value="STRONG">강함 · 권장</option>
          <option value="EXTREME">극대화</option>
        </select>
      </label>
      {(
        [
          ["zoom", "카메라 줌"],
          ["flash", "타격 플래시"],
          ["spriteMotion", "초상화 움직임"],
        ] as const
      ).map(([key, label]) => (
        <label
          key={key}
          className="flex min-h-11 items-center justify-between gap-2"
        >
          {label}
          <select
            aria-label={label}
            className={style}
            value={value[key]}
            onChange={(e) => update({ [key]: Number(e.target.value) })}
          >
            <option value="0">끄기</option>
            <option value="0.4">약하게</option>
            <option value="1">전체</option>
          </select>
        </label>
      ))}
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={value.confirmEndTurn}
          onChange={(e) => update({ confirmEndTurn: e.target.checked })}
        />
        남은 공격·능력이 있을 때 턴 종료 확인
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={value.reducedMotion}
          onChange={(e) => update({ reducedMotion: e.target.checked })}
        />
        모션 감소
      </label>
    </fieldset>
  );
}
