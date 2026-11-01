import { useEffect, useState } from "react";
import {
  readCombatPreferences,
  saveCombatPreferences,
  type CombatPreferences,
} from "../combat-preferences";
import "./reading-accessibility.css";
/** Shared persistent preferences; changes text/decoration only, never board geometry. */
export function ReadingAccessibilityBridge() {
  useEffect(() => {
    const apply = () => {
      const p = readCombatPreferences();
      document.documentElement.style.setProperty(
        "--ko-detail-scale",
        String(p.detailTextScale),
      );
      document.documentElement.style.setProperty(
        "--ko-dialogue-scale",
        String(p.dialogueTextScale),
      );
      document.documentElement.dataset.contrastTargets = String(
        p.highContrastTargets,
      );
    };
    apply();
    window.addEventListener("ko-combat-preferences", apply);
    return () => window.removeEventListener("ko-combat-preferences", apply);
  }, []);
  return null;
}
export function ReadingAccessibilitySettings() {
  const [value, setValue] = useState(readCombatPreferences);
  useEffect(() => {
    const changed = () => setValue(readCombatPreferences());
    window.addEventListener("ko-combat-preferences", changed);
    return () => window.removeEventListener("ko-combat-preferences", changed);
  }, []);
  const update = (patch: Partial<CombatPreferences>) => {
    const next = { ...readCombatPreferences(), ...patch };
    saveCombatPreferences(next);
    setValue(next);
  };
  return (
    <fieldset className="ko-reading-settings space-y-3 border-t border-neutral-700 pt-3">
      <legend className="text-sm text-amber-200">읽기 · 접근성</legend>
      {(
        [
          ["detailTextScale", "카드 설명 글자 크기"],
          ["dialogueTextScale", "대사 글자 크기"],
        ] as const
      ).map(([key, label]) => (
        <label
          key={key}
          className="flex min-h-11 items-center justify-between gap-3 text-sm"
        >
          {label}
          <select
            aria-label={label}
            className="min-h-11 border border-neutral-600 bg-black px-2 text-white"
            value={value[key]}
            onChange={(e) => update({ [key]: Number(e.target.value) })}
          >
            <option value="1">기본</option>
            <option value="1.15">크게 · 115%</option>
            <option value="1.3">더 크게 · 130%</option>
          </select>
        </label>
      ))}
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={value.highContrastTargets}
          onChange={(e) => update({ highContrastTargets: e.target.checked })}
        />
        색상 외 테두리로 대상 구분
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={value.visualEventCaptions}
          onChange={(e) => update({ visualEventCaptions: e.target.checked })}
        />
        소리 없이도 주요 전투 사건 안내
      </label>
      <p className="ko-reading-sample border-l-2 border-amber-700 pl-3 text-neutral-200">
        설명 예시: 선택한 선수에게 효과를 적용합니다.
      </p>
      <p className="text-xs leading-5 text-neutral-400">
        상세 설명·손패 읽기와 대사에 적용됩니다. 필드 카드 크기와 대상 영역은
        바뀌지 않습니다.
      </p>
    </fieldset>
  );
}
