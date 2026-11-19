import "./keyword-fx.css";

/** Keywords drawn as a look on cards that are on the field (no text badge needed). */
export const VISUAL_KEYWORDS = new Set([
  "TAUNT", "DODGE", "DEFENSE", "IMMUNE", "ARMOR", "RUSH", "SURPRISE", "MULTI_STRIKE",
  "LIFESTEAL", "REGEN", "CANNOT_ATTACK", "WANTED", "COUNTDOWN",
]);

export const KEYWORD_NAMES_KEY = "ko-keyword-names";
export type KeywordNamesMode = "always" | "entry";
export function readKeywordNamesMode(): KeywordNamesMode {
  try { return localStorage.getItem(KEYWORD_NAMES_KEY) === "entry" ? "entry" : "always"; } catch { return "always"; }
}
export function setKeywordNamesMode(mode: KeywordNamesMode) {
  try { localStorage.setItem(KEYWORD_NAMES_KEY, mode); } catch { /* ignore */ }
  if (typeof document !== "undefined") document.documentElement.dataset.kwNames = mode;
}
if (typeof document !== "undefined") document.documentElement.dataset.kwNames = readKeywordNamesMode();

/** How each keyword looks on a field card — shown in the card popup so players can connect look ↔ name. */
export const KEYWORD_LOOKS: Record<string, string> = {
  TAUNT: "카드 뒤에 쇠 방패 테두리", DODGE: "카드를 감싼 금빛 보호막", DEFENSE: "푸른 격자무늬 보호막", IMMUNE: "가장자리의 하얀 안개",
  ARMOR: "안쪽 은색 쇠 테두리 + 아래 숫자판", RUSH: "왼쪽으로 흐르는 금빛 바람선", SURPRISE: "발밑 보랏빛 연기와 칼날 번쩍임",
  MULTI_STRIKE: "뒤로 남는 주황 잔상", LIFESTEAL: "붉게 맥동하는 테두리와 핏방울", REGEN: "초록빛과 떠오르는 + 십자",
  CANNOT_ATTACK: "카드 위 X자 쇠사슬", WANTED: "빨간 WANTED 도장", COUNTDOWN: "그림 위 째깍이는 숫자 시계",
};

const NAMES: Record<string, string> = {
  TAUNT: "도발", DODGE: "회피", DEFENSE: "방어", IMMUNE: "면역", ARMOR: "아머", RUSH: "러쉬", SURPRISE: "기습",
  MULTI_STRIKE: "연타", LIFESTEAL: "흡혈", REGEN: "치유", CANNOT_ATTACK: "공격불가", WANTED: "수배", COUNTDOWN: "카운트다운",
};

export function KeywordFx({ keywords, armor, countdown }: { keywords: string[]; armor?: unknown; countdown?: unknown }) {
  const has = (k: string) => keywords.includes(k);
  const shown = keywords.filter(k => VISUAL_KEYWORDS.has(k));
  if (!shown.length) return null;
  return (
    <>
    {has("TAUNT") && <span className="kfx-back kfx-taunt" aria-hidden="true"><i /><b /></span>}
    {has("MULTI_STRIKE") && <span className="kfx-back kfx-multi" aria-hidden="true"><i /><i /></span>}
    {has("RUSH") && <span className="kfx-back kfx-rush" aria-hidden="true"><i /><i /><i /><i /></span>}
    {has("WANTED") && <span className="kfx-top kfx-wanted" aria-hidden="true"><b>WANTED</b></span>}
    <span className="kfx-top kfx-names" aria-hidden="true">{shown.map(k => <i key={k} data-kw={k}>{NAMES[k]}</i>)}</span>
    <span className="kfx" role="img" aria-label={`키워드 ${shown.map(k => NAMES[k]).join(", ")}`} title={shown.map(k => NAMES[k]).join(" · ")}>
      {has("SURPRISE") && <span className="kfx-surprise"><i /><b /></span>}
      {has("LIFESTEAL") && <span className="kfx-lifesteal"><i /><i /><i /></span>}
      {has("REGEN") && <span className="kfx-regen"><i /><i /><i /><i /><i /></span>}
      {has("CANNOT_ATTACK") && <span className="kfx-chains"><i /><i /></span>}
      {has("ARMOR") && <span className="kfx-armor">{typeof armor === "number" && <b>{armor}</b>}</span>}
      {has("DEFENSE") && <span className="kfx-defense" />}
      {has("IMMUNE") && <span className="kfx-immune" />}
      {has("DODGE") && <span className="kfx-dodge"><i /></span>}
      {has("COUNTDOWN") && <span className="kfx-countdown"><b>{typeof countdown === "number" ? countdown : ""}</b></span>}
    </span>
    </>
  );
}
