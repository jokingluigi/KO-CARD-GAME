import { useMemo, useState } from "react";
import { applySpellingFixes, checkCardText, fixAllSpelling } from "@/lib/card-text-spelling";
import "./spelling-helper.css";

const AUTO_KEY = "ko-admin-spelling-auto";

/** "입력을 마치면 자동으로 고치기" — remembered on this device. */
export function useSpellingAuto() {
  const [auto, setAutoState] = useState(() => { try { return localStorage.getItem(AUTO_KEY) !== "off"; } catch { return true; } });
  const setAuto = (on: boolean) => { setAutoState(on); try { localStorage.setItem(AUTO_KEY, on ? "on" : "off"); } catch { /* ignore */ } };
  return [auto, setAuto] as const;
}

/** Text after automatic fixing, or null when nothing changed. */
export function autoFixedText(text: string, names: readonly string[]) {
  const fixed = fixAllSpelling(text, names);
  return fixed === text ? null : fixed;
}

/**
 * 맞춤법 도우미 — shows each suggestion ("앞 → 뒤 · 이유") with a fix button, plus "모두 고치기".
 * `auto` + `onAutoChange` show the "자동으로 고치기" switch.
 */
export function SpellingHelper({ text, names, onApply, auto, onAutoChange, undo }: {
  text: string; names: readonly string[]; onApply: (next: string) => void;
  auto?: boolean; onAutoChange?: (on: boolean) => void; undo?: { label: string; onUndo: () => void } | null;
}) {
  const fixes = useMemo(() => checkCardText(text, names), [text, names]);
  const [open, setOpen] = useState(false);
  const shown = open ? fixes : fixes.slice(0, 3);
  return (
    <div className="spell" data-ok={!fixes.length || undefined}>
      <div className="spell-head">
        <b>{fixes.length ? `맞춤법 · 고칠 곳 ${fixes.length}개` : "맞춤법 ✓ 고칠 곳 없음"}</b>
        {onAutoChange && <label className="spell-auto"><input type="checkbox" checked={Boolean(auto)} onChange={(e) => onAutoChange(e.target.checked)} />글 쓰고 나면 자동으로 고치기</label>}
        {fixes.length > 0 && <button type="button" className="spell-all" onClick={() => onApply(fixAllSpelling(text, names))}>모두 고치기</button>}
      </div>
      {undo && <div className="spell-undo"><span>{undo.label}</span><button type="button" onClick={undo.onUndo}>되돌리기</button></div>}
      {fixes.length > 0 && <ul>
        {shown.map((f) => (
          <li key={f.id}>
            <span className="spell-change"><del>{f.from === "" ? "(없음)" : f.from.replace(/ /g, "␣")}</del>→<ins>{f.to === "" ? "(지움)" : f.to.replace(/ /g, "␣")}</ins></span>
            <small>{f.reason}</small>
            <button type="button" onClick={() => onApply(applySpellingFixes(text, [f]))}>고치기</button>
          </li>
        ))}
      </ul>}
      {fixes.length > 3 && <button type="button" className="spell-more" onClick={() => setOpen(!open)}>{open ? "접기" : `${fixes.length - 3}개 더 보기`}</button>}
    </div>
  );
}
