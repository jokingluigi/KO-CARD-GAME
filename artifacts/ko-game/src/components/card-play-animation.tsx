import { useEffect, useRef, useState, useId } from "react";
import type { CSSProperties } from "react";

import { useCinematicEvent, useCinematicAvailable } from './cinematic-layer';
import { CardRenderer } from "./card-renderer";
import { getCardDefinition } from "@/game";
import { getActiveCardKeywords } from "../game/cards/granted-text";
import { getCardRuntimeRulesText } from "../lib/card-display-state";
import type { CardPlayAnimationState } from "./card-play-animation-utils";
import { techniqueRevealRect, techniqueStageGeometry, wrestlerPlayRect } from "./card-play-animation-utils";
import { PRESENTATION_CONFIG, prefersReducedMotion } from "./presentation-config";
import { audioManager } from '../audio/audio-manager';
import { BattleVfx } from './battle-vfx';
import {useScreenImpact} from './screen-impact';
import {impactRank,summonImpact,summonTimeline,summonFrames,hasBoardWideImpact} from './screen-impact-policy';

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
  hapticsEnabled=true,
}: {
  animation: CardPlayAnimationState;
  onComplete: () => void;
  viewerPlayerId?: string;
  hapticsEnabled?: boolean;
}) {
  const occurrenceId = useId();
  const completedRef = useRef(false);
  const cardRef=useRef<HTMLDivElement>(null),landedRef=useRef(false);
  const [landed,setLanded]=useState(false);
  const screen=useScreenImpact(),screenRef=useRef(screen);screenRef.current=screen;
  const managed=useCinematicAvailable();
  const [viewport,setViewport]=useState(()=>({width:window.innerWidth,height:window.innerHeight}));
  useEffect(()=>{
    const resize=()=>setViewport({width:window.innerWidth,height:window.innerHeight});
    window.addEventListener('resize',resize);
    return()=>window.removeEventListener('resize',resize);
  },[]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const definition = getCardDefinition(animation.card.definitionId);

  // Capture viewport geometry once per play; camera recoil must not restart the flight.
  const geometryRef=useRef({id:animation.card.instanceId,kind:animation.kind,value:animation.geometry});
  if(geometryRef.current.id!==animation.card.instanceId||geometryRef.current.kind!==animation.kind)geometryRef.current={id:animation.card.instanceId,kind:animation.kind,value:animation.geometry};
  const geometry=geometryRef.current.value;
  const source = animation.kind === "TECHNIQUE"
    ? techniqueRevealRect(geometry.source)
    : wrestlerPlayRect(geometry.source);
  const target = animation.kind === "WRESTLER" ? geometry.target : undefined;
  const reveal=techniqueStageGeometry(source,viewport);
  const reduced=prefersReducedMotion();
  const impactCost=definition?.cost??animation.card.currentCost;
  const profile=summonImpact(impactCost,animation.card.isChampionToken?'CHAMPION':definition?.rarity);
  const timing=summonTimeline(impactCost,profile.rarity,reduced);
  const duration=animation.kind==='WRESTLER'?timing.duration:animationDuration(animation);
  useCinematicEvent(animation.kind==='TECHNIQUE'&&animation.card.currentCost<4?null:{id:`play:${animation.card.instanceId}:${animation.kind}:${occurrenceId}`,kind:animation.kind==='TECHNIQUE'?'BIG_SPELL':profile.rarity==='CHAMPION'?'CHAMPION':profile.rarity==='LEGENDARY'?'LEGENDARY':'SUMMON',title:definition?.name??'KO',art:definition?.imageUrl,strength:impactCost,duration:profile.rarity==='LEGENDARY'||profile.rarity==='CHAMPION'?Math.max(200,timing.landing-50):undefined});

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
    completedRef.current=false;landedRef.current=false;setLanded(false);
    let frame=0;let motion:Animation|undefined;const origin=performance.now();
    const finish=()=>{
      if(completedRef.current)return;completedRef.current=true;onCompleteRef.current();
    };
    const land=()=>{
      if(landedRef.current||document.hidden)return;
      landedRef.current=true;setLanded(true);
      const x=targetLeft+source.width*targetScale/2,y=targetTop+source.height*targetScale/2;
      const accepted=screenRef.current.request({id:'landing:'+occurrenceId+':'+animation.card.instanceId,profile,x,y,direction:{x:0,y:1},nearby:impactRank(profile)>=3});
      if(!accepted&&screenRef.current.isActive())return;
      const file=impactRank(profile)>=4?'very-heavy':impactRank(profile)>=3?'heavy':impactRank(profile)>=2?'normal':'light';
      const priority=profile.rarity==='CHAMPION'?8:profile.rarity==='LEGENDARY'?7:impactRank(profile)>=3?6:4;
      audioManager.playImpactOverlay(`${import.meta.env.BASE_URL}sfx/impact-${file}.wav`,impactRank(profile)>=3?65:36,priority);
      if(profile.bass)audioManager.playImpactOverlay(`${import.meta.env.BASE_URL}sfx/summon-bass-${profile.bass}.wav`,profile.rarity==='CHAMPION'?78:profile.rarity==='LEGENDARY'?70:60,priority);
      if(impactRank(profile)>=3)audioManager.duckForPresentation(.55,profile.duration+100);
      if(hapticsEnabled&&!reduced&&window.matchMedia('(pointer: coarse)').matches&&typeof navigator.vibrate==='function'&&(impactCost>=5||profile.rarity==='LEGENDARY'||profile.rarity==='CHAMPION'))navigator.vibrate(impactRank(profile)>=4?55:30);
    };
    if(animation.kind==='WRESTLER'){
      if(profile.bass)audioManager.preloadAttackSounds([`${import.meta.env.BASE_URL}sfx/summon-bass-${profile.bass}.wav`]);
      try{motion=cardRef.current?.animate(summonFrames(source,{left:targetLeft,top:targetTop},targetScale,profile,timing.landing,duration,reduced),{duration,easing:'linear',fill:'both'});}catch{/* Time-based visual fallback only. */}
      const tick=(now:number)=>{
        if(Number(motion?.currentTime??now-origin)>=timing.landing)land();
        if(!completedRef.current)frame=requestAnimationFrame(tick);
      };
      frame=requestAnimationFrame(tick);
      if(motion)motion.onfinish=()=>{land();finish();};
    }
    const spellImpact=animation.kind==='TECHNIQUE'&&hasBoardWideImpact(definition?.abilities)?window.setTimeout(()=>screenRef.current.request({id:'spell-impact:'+occurrenceId,profile:summonImpact(Math.max(5,impactCost)),x:innerWidth/2,y:innerHeight*.45,radial:true,nearby:true}),Math.round(duration*.28)):null;
    const fallback=window.setTimeout(finish,duration+120);
    const resized=()=>{if(animation.kind==='WRESTLER')finish();};
    const hidden=()=>{if(document.hidden)finish();};
    window.addEventListener('resize',resized);document.addEventListener('visibilitychange',hidden);
    return()=>{clearTimeout(fallback);if(spellImpact!==null)clearTimeout(spellImpact);cancelAnimationFrame(frame);if(motion){motion.onfinish=null;motion.cancel();}window.removeEventListener('resize',resized);document.removeEventListener('visibilitychange',hidden);};
  },[animation.card.instanceId,occurrenceId,animation.kind,duration,targetLeft,targetTop,targetScale]);


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
      className={`card-play-animation ${animation.kind==='WRESTLER'?'ko-summon-motion':''} ${animation.kind==='WRESTLER'&&(animation.card.currentCost>=6||definition?.rarity==='CHAMPION'||definition?.rarity==='LEGENDARY')?'ko-summon-heavy':''} ${animationClass} card-play-animation--rarity-${rarity.toLowerCase()}`}
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
      {(animation.kind==='TECHNIQUE'||landed)&&<BattleVfx kind={animation.kind==='TECHNIQUE'?'MAGIC':rarity==='LEGENDARY'?'GOLD':'IMPACT'}
        left={targetLeft+source.width*targetScale/2} top={targetTop+source.height*targetScale/2}
        seed={`play:${animation.card.instanceId}`} strength={animation.kind==='TECHNIQUE'?5:animation.card.currentCost}
        delay={animation.kind==='TECHNIQUE'&&!reduced?duration*.28:0} duration={animation.kind==='TECHNIQUE'?250:Math.max(120,duration*.24)} />}
      <div
        ref={cardRef}
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
      {animation.kind==='WRESTLER'&&!managed&&rarity==='LEGENDARY'&&<><div className="legendary-entrance__focus"/><div className="legendary-entrance__title">{definition?.name}</div></>}
    </div>
  );
}
