import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { CardRenderer } from "./card-renderer";
import { getCardDefinition } from "@/game";
import { getActiveCardKeywords } from "../game/cards/granted-text";
import { getCardRuntimeRulesText } from "../lib/card-display-state";
import type { CardPlayAnimationState } from "./card-play-animation-utils";
import { techniqueRevealRect, techniqueStageGeometry, wrestlerPlayRect } from "./card-play-animation-utils";
import { PRESENTATION_CONFIG, prefersReducedMotion } from "./presentation-config";
import { audioManager } from '../audio/audio-manager';
import { BattleVfx } from './battle-vfx';

export const TECHNIQUE_REVEAL_HOLD_MS = 160;
export const TECHNIQUE_REVEAL_TOTAL_MS = PRESENTATION_CONFIG.techniqueRevealMs;

function animationDuration(animation: CardPlayAnimationState) {
  const reducedMotion = prefersReducedMotion();
  if (reducedMotion) return 180;
  if (animation.kind === "TECHNIQUE") return TECHNIQUE_REVEAL_TOTAL_MS;
  if (getCardDefinition(animation.card.definitionId)?.rarity === 'LEGENDARY') return 940;
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
  const [viewport,setViewport]=useState(()=>({width:window.innerWidth,height:window.innerHeight}));
  useEffect(()=>{
    const resize=()=>setViewport({width:window.innerWidth,height:window.innerHeight});
    window.addEventListener('resize',resize);
    return()=>window.removeEventListener('resize',resize);
  },[]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const definition = getCardDefinition(animation.card.definitionId);
  const source = animation.kind === "TECHNIQUE"
    ? techniqueRevealRect(animation.geometry.source)
    : wrestlerPlayRect(animation.geometry.source);
  const target = animation.kind === "WRESTLER" ? animation.geometry.target : undefined;
  const reveal=techniqueStageGeometry(source,viewport);
  const duration=animationDuration(animation);
  const targetScale = animation.kind === "TECHNIQUE"
    ? reveal.scale
    : target ? Math.min(target.width/Math.max(source.width,1),target.height/Math.max(source.height,1)) : 1;
  const targetLeft = animation.kind === "TECHNIQUE"
    ? reveal.left
    : target ? target.left + (target.width - source.width * targetScale) / 2 : window.innerWidth / 2 - source.width / 2;
  const targetTop = animation.kind === "TECHNIQUE"
    ? reveal.top
    : target ? target.top + (target.height - source.height * targetScale) / 2 : window.innerHeight / 2 - source.height / 2;
  const travelX = targetLeft - source.left;
  const travelY = targetTop - source.top;
  const style = {
    "--play-from-x": `${source.left}px`,
    "--play-from-y": `${source.top}px`,
    "--play-target-x": `${targetLeft}px`,
    "--play-target-y": `${targetTop}px`,
    "--play-arc-x": `${source.left + travelX * 0.56}px`,
    "--play-arc-y": `${source.top + travelY * 0.56 - Math.min(42, Math.max(16, Math.abs(travelY) * 0.12))}px`,
    "--play-target-scale": String(targetScale),
    "--play-source-width": `${source.width}px`,
    "--play-source-height": `${source.height}px`,
    "--play-duration": `${duration}ms`,
    "--play-stage-x": `${targetLeft+source.width*targetScale/2}px`,
    "--play-stage-y": `${targetTop+source.height*targetScale/2}px`,
    "--play-stage-width": `${source.width*targetScale}px`,
    "--play-stage-height": `${source.height*targetScale}px`,
  } as CSSProperties;

  useEffect(() => {
    completedRef.current = false;
    const isUnit=animation.kind==='WRESTLER';
    const weight=isUnit ? animation.impactLevel : 'LIGHT';
    const impactId = isUnit ? window.setTimeout(() => {
      const file=weight==='VERY_HEAVY'?'very-heavy':weight==='HEAVY'?'heavy':weight==='LIGHT'?'light':'normal';
      audioManager.playImpactOverlay(`${import.meta.env.BASE_URL}sfx/impact-${file}.wav`,weight==='LIGHT'?28:45);
    }, prefersReducedMotion() ? 70 : duration*.76) : null;
    const timeoutId = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current();
    }, animationDuration(animation) + 120);
    return () => { window.clearTimeout(timeoutId); if (impactId !== null) window.clearTimeout(impactId); };
  }, [animation]);

  function complete(event: React.AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget ||
        ![animation.kind === "TECHNIQUE" ? "ko-card-play-technique" : "ko-card-play-wrestler",'ko-cinematic-card-reduced'].includes(event.animationName)) return;
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
    >
      {animation.kind === "TECHNIQUE" && (
        <>
          <div className="card-play-animation__dim" />
          <div className="card-play-animation__sigil" />
          <p className="card-play-animation__label">
            {animation.playerId === undefined || animation.playerId === viewerPlayerId
              ? "주문 사용"
              : "상대가 주문을 사용했습니다"}
          </p>
        </>
      )}
      <BattleVfx kind={animation.kind==='TECHNIQUE'?'MAGIC':rarity==='LEGENDARY'||rarity==='CHAMPION'?'GOLD':'IMPACT'}
        left={targetLeft+source.width*targetScale/2} top={targetTop+source.height*targetScale/2}
        seed={`play:${animation.card.instanceId}`} strength={animation.kind==='TECHNIQUE'?5:animation.card.currentCost}
        delay={prefersReducedMotion()?0:duration*(animation.kind==='TECHNIQUE' ? .28 : .76)} duration={animation.kind==='TECHNIQUE'?250:Math.max(120,duration*.24)} />
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
          rulesText={getCardRuntimeRulesText(animation.card, definition?.rulesText ?? "효과 없음")}
          imageUrl={definition?.imageUrl}
          rarity={definition?.rarity}
          size={animation.kind === "TECHNIQUE" ? "detail" : "hand"}
          imageDisplaySettings={definition}
          runtimeKeywords={getActiveCardKeywords(animation.card)}
          isSilenced={animation.card.isSilenced}
          isStunned={animation.card.isStunned}
          isAbilityDisabled={animation.card.isAbilityDisabled}
          className="h-full w-full"
        />
      </div>
      {animation.kind === "WRESTLER" && (
        <>
          {rarity === 'LEGENDARY' && <><div className="legendary-entrance__focus" /><div className="legendary-entrance__ring" /><div className="legendary-entrance__title">{definition?.name}</div></>}
          <div className="card-play-animation__flash" />
          {(animation.impactLevel === "HEAVY" || animation.impactLevel === "VERY_HEAVY") && (
            <div className="card-play-animation__shockwave" />
          )}
        </>
      )}
    </div>
  );
}
