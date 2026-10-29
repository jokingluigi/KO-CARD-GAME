import {BattleCosmeticsContext,CosmeticBack} from "./cosmetic-battle";
import { useEffect, useRef, useContext } from "react";
import type { CSSProperties } from "react";

import { getCardDefinition, type CardInstance } from "@/game";
import { CardRenderer } from "./card-renderer";
import { getActiveCardKeywords } from "../game/cards/granted-text";
import { getCardRuntimeRulesText } from "../lib/card-display-state";
import { PRESENTATION_CONFIG, prefersReducedMotion } from "./presentation-config";
import { BattleVfx } from './battle-vfx';

export type CardLeaveKind = "RETIRE" | "DESTROY" | "REMOVE" | "FUSION" | "VANISH" | "RETURN_HAND" | "RETURN_DECK" | "GENERATE";

export type CardLeaveAnimationState = {
  id: string;
  cosmeticOwnerId?:string;
  card: CardInstance|null;
  kind: CardLeaveKind;
  geometry: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  effectTriggered?: boolean;
  destination?: { left: number; top: number };
  delay: number;
  concealed?:boolean;
  targetScale?:number;
};

function durationFor(kind: CardLeaveKind) {
  const reducedMotion = prefersReducedMotion();
  if (reducedMotion) return 140;
  if (["RETURN_HAND","RETURN_DECK","GENERATE"].includes(kind))return 360;
  if (kind === "FUSION") return 400;
  if (kind === "VANISH") return 220;
  return kind === "DESTROY"
    ? PRESENTATION_CONFIG.destroyMs
    : kind === "REMOVE"
      ? PRESENTATION_CONFIG.removeMs
      : PRESENTATION_CONFIG.retireMs;
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
  const card=animation.card,loadouts=useContext(BattleCosmeticsContext);
  const definition = card ? getCardDefinition(card.definitionId) : undefined;
  const duration = durationFor(animation.kind);
  const transfer=["RETURN_HAND","RETURN_DECK","GENERATE"].includes(animation.kind);
  const style = {
    "--leave-left": `${animation.geometry.left}px`,
    "--leave-top": `${animation.geometry.top}px`,
    "--leave-width": `${animation.geometry.width}px`,
    "--leave-height": `${animation.geometry.height}px`,
    "--leave-delay": `${animation.delay}ms`,
    "--leave-dx": `${animation.destination ? animation.destination.left-animation.geometry.left-animation.geometry.width/2 : 0}px`,
    "--leave-dy": `${animation.destination ? animation.destination.top-animation.geometry.top-animation.geometry.height/2 : 22}px`,
    "--leave-target-scale":String(animation.targetScale??.25),
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
    <>
    {!transfer&&<BattleVfx kind={animation.kind==='DESTROY'?'DESTROY':animation.kind==='RETIRE'?'RETIRE':'MAGIC'}
      left={animation.geometry.left+animation.geometry.width/2} top={animation.geometry.top+animation.geometry.height/2}
      seed={animation.id} strength={animation.kind==='DESTROY'?8:3} delay={prefersReducedMotion()?0:animation.delay+duration*.25} duration={duration*.7} />}
    <div
      aria-hidden="true"
      className={`card-leave-animation card-leave-animation--${animation.kind.toLowerCase()}`}
      style={style}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (completedRef.current) return;
        completedRef.current = true;
        onCompleteRef.current();
      }}
    >
      {animation.concealed || !card ? <div className="ko-zone-concealed-back"><CosmeticBack loadout={loadouts[animation.cosmeticOwnerId??""]}/></div> : <CardRenderer cardId={card.definitionId} cosmeticOwnerId={(!card.isToken||card.isChampionToken)?animation.cosmeticOwnerId:undefined}
        name={definition?.name ?? "카드"}
        cardType={card.cardType === "TECHNIQUE" ? "TECHNIQUE" : "WRESTLER"}
        cost={card.currentCost}
        attack={card.currentAttack}
        health={card.currentHealth}
        rulesText={getCardRuntimeRulesText(card, definition?.rulesText ?? "효과 없음")}
        imageUrl={definition?.imageUrl}
        rarity={definition?.rarity}
        size="board"
        imageDisplaySettings={definition}
        runtimeKeywords={getActiveCardKeywords(card)}
        isSilenced={card.isSilenced}
        isStunned={card.isStunned}
        isAbilityDisabled={card.isAbilityDisabled}
        className={`h-full w-full ${animation.effectTriggered ? "presentation-leave-effect" : ""}`}
      />}
    </div>
    </>
  );
}
