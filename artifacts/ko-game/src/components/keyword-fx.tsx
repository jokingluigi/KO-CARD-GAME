import { Ban, Coins, Droplet, Hourglass, Shield, Sprout, Swords, Zap, Crosshair } from "lucide-react";
import "./keyword-fx.css";

/** Keywords drawn as a look on cards that are on the field (no text badge needed). */
export const VISUAL_KEYWORDS = new Set([
  "TAUNT", "DODGE", "DEFENSE", "IMMUNE", "ARMOR", "RUSH", "SURPRISE", "MULTI_STRIKE",
  "LIFESTEAL", "REGEN", "CANNOT_ATTACK", "WANTED", "COUNTDOWN",
]);

const ICONS: Record<string, { icon: typeof Zap; label: string }> = {
  RUSH: { icon: Zap, label: "러쉬" },
  SURPRISE: { icon: Crosshair, label: "기습" },
  MULTI_STRIKE: { icon: Swords, label: "연타" },
  LIFESTEAL: { icon: Droplet, label: "흡혈" },
  REGEN: { icon: Sprout, label: "치유" },
  CANNOT_ATTACK: { icon: Ban, label: "공격불가" },
  WANTED: { icon: Coins, label: "수배" },
  COUNTDOWN: { icon: Hourglass, label: "카운트다운" },
  ARMOR: { icon: Shield, label: "아머" },
};
const ORDER = ["RUSH", "SURPRISE", "MULTI_STRIKE", "LIFESTEAL", "REGEN", "ARMOR", "COUNTDOWN", "WANTED", "CANNOT_ATTACK"];

export function KeywordFx({ keywords, armor, countdown }: { keywords: string[]; armor?: unknown; countdown?: unknown }) {
  const has = (k: string) => keywords.includes(k);
  const emblems = ORDER.filter(has);
  if (!keywords.some(k => VISUAL_KEYWORDS.has(k))) return null;
  return (
    <>
      {has("TAUNT") && <span className="kfx-taunt" aria-hidden="true"><i /></span>}
      {has("DEFENSE") && <span className="kfx-defense" aria-hidden="true" />}
      {has("IMMUNE") && <span className="kfx-immune" aria-hidden="true" />}
      {has("DODGE") && <span className="kfx-dodge" aria-hidden="true"><i /></span>}
      {has("REGEN") && <span className="kfx-regen" aria-hidden="true"><i /><i /><i /></span>}
      {emblems.length > 0 && (
        <span className="kfx-emblems">
          {emblems.map(k => {
            const { icon: Icon, label } = ICONS[k];
            const value = k === "ARMOR" && typeof armor === "number" ? armor : k === "COUNTDOWN" && typeof countdown === "number" ? countdown : null;
            return (
              <span key={k} className="kfx-emblem" data-kw={k} title={label} aria-label={value !== null ? `${label} ${value}` : label} role="img">
                <Icon strokeWidth={2.4} aria-hidden="true" />
                {value !== null && <b>{value}</b>}
              </span>
            );
          })}
        </span>
      )}
    </>
  );
}
