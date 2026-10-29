import { MotionNumber } from "./presentation-motion";
import { displayHealth } from "./match-display-utils";
import "./champion-portrait-frame.css";

/** HUD chrome inside the existing champion target; never intercepts input. */
export function ChampionPortraitFrame({
  name,
  health,
  maxHealth,
}: {
  name: string;
  health: number;
  maxHealth: number;
}) {
  return (
    <>
      <div className="ko-portrait-arch" aria-hidden="true" />
      <div className="ko-portrait-rim" aria-hidden="true">
        <i />
        <b />
        <svg className="ko-portrait-wear" viewBox="0 0 100 100" preserveAspectRatio="none"
          data-wear={health <= 0 || (health > 0 && health <= 5) ? 3 : health / Math.max(1,maxHealth) <= .35 ? 2 : health / Math.max(1,maxHealth) <= .65 ? 1 : 0}>
          <path className="ko-wear-light" d="M2 53L7 56L2 61M94 31L99 35L94 39"/>
          <path className="ko-wear-medium" d="M22 6L25 10L21 13M98 72L93 76L98 81M4 79L8 84L4 88"/>
          <path className="ko-wear-critical" d="M60 2L57 7L63 11M10 22L6 28L11 32M77 99L73 94L79 90"/>
        </svg>
      </div>
      <div className="ko-portrait-plinth" aria-hidden="true" />
      <span className="ko-portrait-name font-display" title={name}>
        {name.replace(/^챔피언\s*/, "")}
      </span>
      <div
        className="ko-portrait-health"
        data-low={health > 0 && health <= 5}
        aria-label={`${name} 체력 ${displayHealth(health)} / ${maxHealth}`}
      >
        <span className="ko-portrait-health__label">체력</span>
        <span className="ko-portrait-health__value font-display">
          <MotionNumber value={health} format={displayHealth} />
          <small> / {maxHealth}</small>
        </span>
      </div>
    </>
  );
}
