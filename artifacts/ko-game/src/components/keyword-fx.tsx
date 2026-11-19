import "./keyword-fx.css";

/** Keywords drawn as a look on cards that are on the field (no text badge needed). */
export const VISUAL_KEYWORDS = new Set([
  "TAUNT", "DODGE", "DEFENSE", "IMMUNE", "ARMOR", "RUSH", "SURPRISE", "MULTI_STRIKE",
  "LIFESTEAL", "REGEN", "CANNOT_ATTACK", "WANTED", "COUNTDOWN",
]);

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
    <span className="kfx" role="img" aria-label={`키워드 ${shown.map(k => NAMES[k]).join(", ")}`} title={shown.map(k => NAMES[k]).join(" · ")}>
      {has("SURPRISE") && <span className="kfx-surprise"><i /><b /></span>}
      {has("LIFESTEAL") && <span className="kfx-lifesteal"><i /><i /><i /></span>}
      {has("REGEN") && <span className="kfx-regen"><i /><i /><i /><i /></span>}
      {has("WANTED") && <span className="kfx-wanted"><i /></span>}
      {has("CANNOT_ATTACK") && <span className="kfx-chains"><i /><i /></span>}
      {has("ARMOR") && <span className="kfx-armor"><i /><i /><i /><i />{typeof armor === "number" && <b>{armor}</b>}</span>}
      {has("DEFENSE") && <span className="kfx-defense" />}
      {has("IMMUNE") && <span className="kfx-immune" />}
      {has("DODGE") && <span className="kfx-dodge"><i /></span>}
      {has("COUNTDOWN") && <span className="kfx-countdown"><b>{typeof countdown === "number" ? countdown : ""}</b></span>}
    </span>
    </>
  );
}
