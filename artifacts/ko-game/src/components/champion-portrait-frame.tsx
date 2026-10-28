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
