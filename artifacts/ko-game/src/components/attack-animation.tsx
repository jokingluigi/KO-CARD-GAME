import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { CardRenderer } from "./card-renderer";
import { getCardDefinition } from "@/game";
import type { AttackAnimationState } from "./attack-animation-utils";
import { attackAnimationDuration } from "./attack-animation-utils";

export function AttackAnimation({
  animation,
  onImpact,
  onComplete,
}: {
  animation: AttackAnimationState;
  onImpact: () => void;
  onComplete: () => void;
}) {
  const impactedRef = useRef(false);
  const completedRef = useRef(false);
  const onImpactRef = useRef(onImpact);
  const onCompleteRef = useRef(onComplete);
  onImpactRef.current = onImpact;
  onCompleteRef.current = onComplete;
  const definition = getCardDefinition(animation.attacker.definitionId);
  const { source, target } = animation.geometry;
  const duration = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? 140
    : attackAnimationDuration(animation.currentAttack);
  const impactDelay = Math.round(duration * 0.56);
  const dx = target.left + target.width / 2 - (source.left + source.width / 2);
  const dy = target.top + target.height / 2 - (source.top + source.height / 2);
  const style = {
    "--attack-source-x": `${source.left}px`,
    "--attack-source-y": `${source.top}px`,
    "--attack-source-width": `${source.width}px`,
    "--attack-source-height": `${source.height}px`,
    "--attack-dx": `${dx}px`,
    "--attack-dy": `${dy}px`,
    "--attack-duration": `${duration}ms`,
    "--attack-impact-delay": `${impactDelay}ms`,
    "--attack-target-x": `${target.left}px`,
    "--attack-target-y": `${target.top}px`,
    "--attack-target-width": `${target.width}px`,
    "--attack-target-height": `${target.height}px`,
  } as CSSProperties;

  useEffect(() => {
    impactedRef.current = false;
    completedRef.current = false;
    const impactTimer = window.setTimeout(() => {
      if (impactedRef.current) return;
      impactedRef.current = true;
      onImpactRef.current();
    }, impactDelay);
    const completeTimer = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current();
    }, duration + 100);
    return () => {
      window.clearTimeout(impactTimer);
      window.clearTimeout(completeTimer);
    };
  }, [duration, impactDelay]);

  const impactClass = `attack-animation--${animation.impactLevel.toLowerCase()}`;
  const rarity = definition?.rarity ?? "NORMAL";

  return (
    <div
      aria-hidden="true"
      className={`attack-animation ${impactClass} attack-animation--rarity-${rarity.toLowerCase()}`}
      style={style}
    >
      <div className="attack-animation__target">
        {animation.targetKind === "CARD" && animation.target ? (
          <CardRenderer
            name={getCardDefinition(animation.target.definitionId)?.name ?? "대상"}
            cost={animation.target.currentCost}
            attack={animation.target.currentAttack}
            health={animation.target.currentHealth}
            rulesText={getCardDefinition(animation.target.definitionId)?.rulesText ?? "효과 없음"}
            imageUrl={getCardDefinition(animation.target.definitionId)?.imageUrl}
            rarity={getCardDefinition(animation.target.definitionId)?.rarity}
            size="board"
            imageDisplaySettings={getCardDefinition(animation.target.definitionId)}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded border-2 border-red-400/80 bg-red-950/80 text-[10px] font-black text-red-100 md:text-sm">
            챔피언
          </div>
        )}
      </div>
      <div className="attack-animation__attacker">
        <CardRenderer
          name={definition?.name ?? "공격 카드"}
          cost={animation.attacker.currentCost}
          attack={animation.attacker.currentAttack}
          health={animation.attacker.currentHealth}
          rulesText={definition?.rulesText ?? "효과 없음"}
          imageUrl={definition?.imageUrl}
          rarity={definition?.rarity}
          size="board"
          imageDisplaySettings={definition}
          className="h-full w-full"
        />
      </div>
      {animation.damage >= 8 && <div className="attack-animation__shockwave" />}
      <div className="attack-animation__impact-flash" />
    </div>
  );
}