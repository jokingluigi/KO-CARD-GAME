import { ShieldCheck } from "lucide-react";
import { prefersReducedMotion } from "./presentation-config";
import "./champion-protection.css";

/** Anchored to the portrait aperture, independent of sprite motion and hit targets. */
export function ChampionProtection() {
  return (
    <div
      className="ko-champion-ward"
      data-reduced-motion={prefersReducedMotion()}
      data-testid="champion-protection"
      role="status"
      aria-label="챔피언 무적. 필드의 챔피언 토큰이 보호하여 본체를 향한 공격과 피해를 막습니다."
    >
      <span className="ko-champion-ward__surface" aria-hidden="true" />
      <span className="ko-champion-ward__seal" aria-hidden="true">
        <span>
          <ShieldCheck strokeWidth={2.5} />
          <strong>무적</strong>
        </span>
        <small>챔피언 토큰 보호</small>
      </span>
    </div>
  );
}
