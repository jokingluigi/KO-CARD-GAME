import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { getCardDefinition, type CardInstance } from "@/game";
import { CardRenderer } from "./card-renderer";

export type CardLeaveKind = "RETIRE" | "DESTROY" | "REMOVE";

export type CardLeaveAnimationState = {
  id: string;
  card: CardInstance;
  kind: CardLeaveKind;
  geometry: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  delay: number;
};

function durationFor(kind: CardLeaveKind) {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return 140;
  return kind === "DESTROY" ? 360 : kind === "REMOVE" ? 280 : 440;
}

export function CardLeaveAnimation({
  animation,
  onComplete,
}: {
  animation: CardLeaveAnimationState;
  onComplete: () => void;
}) {
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const definition = getCardDefinition(animation.card.definitionId);
  const duration = durationFor(animation.kind);
  const style = {
    "--leave-left": `${animation.geometry.left}px`,
    "--leave-top": `${animation.geometry.top}px`,
    "--leave-width": `${animation.geometry.width}px`,
    "--leave-height": `${animation.geometry.height}px`,
    "--leave-delay": `${animation.delay}ms`,
    "--leave-duration": `${duration}ms`,
  } as CSSProperties;

  useEffect(() => {
    completedRef.current = false;
    const timeoutId = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current();
    }, animation.delay + duration + 80);
    return () => window.clearTimeout(timeoutId);
  }, [animation.delay, animation.id, duration]);

  return (
    <div
      aria-hidden="true"
      className={`card-leave-animation card-leave-animation--${animation.kind.toLowerCase()}`}
      style={style}
      onAnimationEnd={() => {
        if (completedRef.current) return;
        completedRef.current = true;
        onCompleteRef.current();
      }}
    >
      <CardRenderer
        name={definition?.name ?? "카드"}
        cost={animation.card.currentCost}
        attack={animation.card.currentAttack}
        health={animation.card.currentHealth}
        rulesText={definition?.rulesText ?? "효과 없음"}
        imageUrl={definition?.imageUrl}
        rarity={definition?.rarity}
        size="board"
        imageDisplaySettings={definition}
        className="h-full w-full"
      />
    </div>
  );
}