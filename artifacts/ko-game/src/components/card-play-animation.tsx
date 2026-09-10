import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { CardRenderer } from "./card-renderer";
import { getCardDefinition } from "@/game";
import type { CardPlayAnimationState } from "./card-play-animation-utils";

function animationDuration(animation: CardPlayAnimationState) {
  if (animation.kind === "TECHNIQUE") return 420;
  if (animation.impactLevel === "VERY_HEAVY") return 580;
  if (animation.impactLevel === "HEAVY") return 540;
  if (animation.impactLevel === "LIGHT") return 420;
  return 480;
}

export function CardPlayAnimation({
  animation,
  onComplete,
}: {
  animation: CardPlayAnimationState;
  onComplete: () => void;
}) {
  const completedRef = useRef(false);
  const definition = getCardDefinition(animation.card.definitionId);
  const source = animation.geometry.source;
  const target = animation.kind === "WRESTLER" ? animation.geometry.target : undefined;
  const targetScale = target ? Math.max(0.75, target.width / Math.max(source.width, 1)) : 1;
  const style = {
    "--play-from-x": `${source.left}px`,
    "--play-from-y": `${source.top}px`,
    "--play-target-x": `${target?.left ?? window.innerWidth / 2 - source.width / 2}px`,
    "--play-target-y": `${target?.top ?? window.innerHeight / 2 - source.height / 2}px`,
    "--play-target-scale": String(targetScale),
    "--play-source-width": `${source.width}px`,
    "--play-source-height": `${source.height}px`,
  } as CSSProperties;

  useEffect(() => {
    completedRef.current = false;
    const timeoutId = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    }, animationDuration(animation) + 120);
    return () => window.clearTimeout(timeoutId);
  }, [animation, onComplete]);

  function complete() {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }

  const rarity = definition?.rarity ?? "NORMAL";
  const animationClass = animation.kind === "TECHNIQUE"
    ? "card-play-animation--technique"
    : `card-play-animation--wrestler card-play-animation--${animation.impactLevel.toLowerCase()}`;

  return (
    <div
      aria-hidden="true"
      className={`card-play-animation ${animationClass} card-play-animation--rarity-${rarity.toLowerCase()}`}
      style={style}
      onAnimationEnd={complete}
    >
      <div
        className="card-play-animation__card"
        onAnimationEnd={complete}
      >
        <CardRenderer
          name={definition?.name ?? "카드"}
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