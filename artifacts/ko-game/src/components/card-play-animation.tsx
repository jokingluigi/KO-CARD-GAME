import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { CardRenderer } from "./card-renderer";
import { getCardDefinition } from "@/game";
import type { CardPlayAnimationState } from "./card-play-animation-utils";
import { PRESENTATION_CONFIG, prefersReducedMotion } from "./presentation-config";

export const TECHNIQUE_REVEAL_HOLD_MS = 1600;
export const TECHNIQUE_REVEAL_TOTAL_MS = PRESENTATION_CONFIG.techniqueRevealMs;

function animationDuration(animation: CardPlayAnimationState) {
  const reducedMotion = prefersReducedMotion();
  if (reducedMotion) return 180;
  if (animation.kind === "TECHNIQUE") return TECHNIQUE_REVEAL_TOTAL_MS;
  if (animation.impactLevel === "VERY_HEAVY") return PRESENTATION_CONFIG.veryHeavyLandingMs;
  if (animation.impactLevel === "HEAVY") return PRESENTATION_CONFIG.heavyLandingMs;
  if (animation.impactLevel === "LIGHT") return PRESENTATION_CONFIG.lightLandingMs;
  return PRESENTATION_CONFIG.cardPlayMs;
}

export function CardPlayAnimation({
  animation,
  onComplete,
  viewerPlayerId,
}: {
  animation: CardPlayAnimationState;
  onComplete: () => void;
  viewerPlayerId?: string;
}) {
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const definition = getCardDefinition(animation.card.definitionId);
  const source = animation.geometry.source;
  const target = animation.kind === "WRESTLER" ? animation.geometry.target : undefined;
  const targetScale = animation.kind === "TECHNIQUE"
    ? Math.min(1.9, Math.max(1.45, (window.innerWidth - 32) / Math.max(source.width, 1)))
    : target ? Math.max(0.75, target.width / Math.max(source.width, 1)) : 1;
  const targetLeft = animation.kind === "TECHNIQUE"
    ? window.innerWidth / 2 - (source.width * targetScale) / 2
    : target?.left ?? window.innerWidth / 2 - source.width / 2;
  const targetTop = animation.kind === "TECHNIQUE"
    ? window.innerHeight * 0.43 - (source.height * targetScale) / 2
    : target?.top ?? window.innerHeight / 2 - source.height / 2;
  const style = {
    "--play-from-x": `${source.left}px`,
    "--play-from-y": `${source.top}px`,
    "--play-target-x": `${targetLeft}px`,
    "--play-target-y": `${targetTop}px`,
    "--play-target-scale": String(targetScale),
    "--play-source-width": `${source.width}px`,
    "--play-source-height": `${source.height}px`,
  } as CSSProperties;

  useEffect(() => {
    completedRef.current = false;
    const timeoutId = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current();
    }, animationDuration(animation) + 120);
    return () => window.clearTimeout(timeoutId);
  }, [animation]);

  function complete() {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current();
  }

  const rarity = definition?.rarity ?? "NORMAL";
  const animationClass = animation.kind === "TECHNIQUE"
    ? "card-play-animation--technique"
    : `card-play-animation--wrestler card-play-animation--${animation.impactLevel.toLowerCase()}`;

  return (
    <div
      aria-hidden={animation.kind === "WRESTLER"}
      className={`card-play-animation ${animationClass} card-play-animation--rarity-${rarity.toLowerCase()}`}
      style={style}
      onAnimationEnd={complete}
    >
      {animation.kind === "TECHNIQUE" && (
        <>
          <div className="card-play-animation__dim" />
          <p className="card-play-animation__label">
            {animation.playerId === undefined || animation.playerId === viewerPlayerId
              ? "주문 사용"
              : "상대가 주문을 사용했습니다"}
          </p>
        </>
      )}
      <div
        className="card-play-animation__card"
        onAnimationEnd={complete}
      >
        <CardRenderer
          name={definition?.name ?? "카드"}
          cardType={animation.kind}
          cost={animation.card.currentCost}
          attack={animation.card.currentAttack}
          health={animation.card.currentHealth}
          rulesText={definition?.rulesText ?? "효과 없음"}
          imageUrl={definition?.imageUrl}
          rarity={definition?.rarity}
          size={animation.kind === "TECHNIQUE" ? "detail" : "hand"}
          imageDisplaySettings={definition}
          className="h-full w-full"
        />
      </div>
      {animation.kind === "WRESTLER" && (
        <>
          <div className="card-play-animation__flash" />
          {(animation.impactLevel === "HEAVY" || animation.impactLevel === "VERY_HEAVY") && (
            <div className="card-play-animation__shockwave" />
          )}
        </>
      )}
    </div>
  );
}