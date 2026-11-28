
import { spawnCostCoins } from './battle-juice';
import './battle-atmosphere.css';
import {spawnLandingDust,spawnImpactBurst} from './impact-burst';
import {spawnSpellDissolve,spellBurnFrames} from './spell-dissolve';
import {spawnArrivalBuildup,spawnArrivalBlast,arrivalAuraFrames,arrivalTremorFrames} from './card-arrival';
import {useCosmeticImage} from './cosmetic-battle';
import { useEffect, useRef, useState, useId } from "react";
import type { CSSProperties } from "react";

import { useCinematicEvent, useCinematicAvailable } from './cinematic-layer';
import { CardRenderer } from "./card-renderer";
import { getCardDefinition } from "@/game";
import { getActiveCardKeywords } from "../game/cards/granted-text";
import { getCardRuntimeRulesText } from "../lib/card-display-state";
import type { CardPlayAnimationState } from "./card-play-animation-utils";
import {isFinisherSpell} from './card-play-animation-utils';
import { techniqueRevealRect, techniqueStageGeometry, wrestlerPlayRect, summonShadowFrames } from "./card-play-animation-utils";
import { PRESENTATION_CONFIG, prefersReducedMotion } from "./presentation-config";
import { audioManager } from '../audio/audio-manager';

import {useScreenImpact} from './screen-impact';
import {impactRank,summonImpact,summonTimeline,summonFrames,summonPose,hasBoardWideImpact,type SummonPose} from './screen-impact-policy';

export const TECHNIQUE_REVEAL_HOLD_MS = 160;
export const TECHNIQUE_REVEAL_TOTAL_MS = PRESENTATION_CONFIG.techniqueRevealMs;

function animationDuration(animation: CardPlayAnimationState) {
  if (animation.kind === "TECHNIQUE") return TECHNIQUE_REVEAL_TOTAL_MS;
  const reducedMotion = prefersReducedMotion();
  if (reducedMotion) return 180;
  if (getCardDefinition(animation.card.definitionId)?.rarity === 'LEGENDARY') return 940;
  if (animation.impactLevel === "VERY_HEAVY") return PRESENTATION_CONFIG.veryHeavyLandingMs;
  if (animation.impactLevel === "HEAVY") return PRESENTATION_CONFIG.heavyLandingMs;
  if (animation.impactLevel === "LIGHT") return PRESENTATION_CONFIG.lightLandingMs;
  return PRESENTATION_CONFIG.cardPlayMs;
}

export function CardPlayAnimation({
  animation,
  onComplete,
  onLand,
  onReadable,
  viewerPlayerId,
  hapticsEnabled=true,
}: {
  animation: CardPlayAnimationState;
  onComplete: () => void;
  onLand?: (instanceId:string) => void;
  onReadable?:()=>void;
  viewerPlayerId?: string;
  hapticsEnabled?: boolean;
}) {
  const occurrenceId = useId();
  const completedRef = useRef(false);
  const shadowRef=useRef<HTMLDivElement>(null);
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
  const onLandRef=useRef(onLand);onLandRef.current=onLand;
  const readableRef=useRef(onReadable);readableRef.current=onReadable;
  const [reading,setReading]=useState(false);
  const definition = getCardDefinition(animation.card.definitionId);
  const finisherSpell=animation.kind==='TECHNIQUE'&&isFinisherSpell(animation.card,definition);
  const cosmeticArtwork=useCosmeticImage(animation.playerId,animation.card.definitionId,'CARD_SKIN',definition?.imageUrl);

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
  useCinematicEvent(animation.kind==='TECHNIQUE'?null:{id:`play:${animation.card.instanceId}:${animation.kind}:${occurrenceId}`,kind:'SUMMON',title:definition?.name??'KO',art:cosmeticArtwork.src,artFallback:definition?.imageUrl,artDisplay:cosmeticArtwork.display,strength:impactCost});
  // Legendary and champion wrestlers get their own arrival instead of the banner panel.
  const arrival=animation.kind==='WRESTLER'&&(profile.rarity==='LEGENDARY'||profile.rarity==='CHAMPION')?profile.rarity:null;

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
    // 15. 낸 카드의 코스트만큼 골드 동전이 카드로 빨려 들어간다 (직접 낸 카드만).
    if(!animation.batchId&&!document.hidden)try{const golds=document.querySelectorAll('[data-resource="gold"]');const mine=source.top+source.height/2>innerHeight/2;spawnCostCoins(golds[mine?golds.length-1:0]?.getBoundingClientRect(),{x:source.left+source.width/2,y:source.top+source.height/2},Math.max(0,animation.card.currentCost??0));}catch{/* visual only */}
    if(finisherSpell)audioManager.playImpactOverlay(import.meta.env.BASE_URL+'sfx/spell-cast.wav',34,6);
    // A soft whoosh as a card leaves the hand.
    else if(animation.kind==='WRESTLER'&&!reduced&&!document.hidden)audioManager.playImpactOverlay(import.meta.env.BASE_URL+'sfx/card-lift.wav',arrival?32:26,3);
    // Spell cards whoosh up and shimmer as they are cast.
    else if(animation.kind==='TECHNIQUE'&&!document.hidden)audioManager.playImpactOverlay(import.meta.env.BASE_URL+'sfx/spell-cast.wav',30,6);
    let frame=0;let motion:Animation|undefined;const origin=performance.now();
    // Legendary / champion: a swelling riser that peaks on the slam, a dimmed board,
    // turning light rays and a glowing card while it hangs over its slot.
    // On phones a legendary / champion hovers big and centred so its art reads through the effects.
    let pose:SummonPose=summonPose(profile);
    if(arrival&&window.innerWidth<700){
      const tw=source.width*targetScale,th=source.height*targetScale;
      const boost=Math.max(pose.boost,Math.min(window.innerWidth*.46,window.innerHeight*.34*(tw/Math.max(1,th)))/Math.max(1,tw));
      const bw=tw*boost,bh=th*boost;
      const left=Math.min(Math.max(8,targetLeft-(bw-tw)/2),window.innerWidth-bw-8);
      const top=Math.max(56,Math.min(targetTop-pose.lift,window.innerHeight*.46-bh/2));
      pose={...pose,boost,lift:targetTop-top,dx:left-targetLeft};
    }
    const hangStart=Math.max(0,timing.landing-pose.slam-pose.hang);
    let clearBuildup=()=>{},aura:Animation|undefined,tremor:Animation|undefined,riser:number|null=null;
    if(arrival&&!reduced&&!document.hidden){
      const riserMs=arrival==='LEGENDARY'?980:1150;
      riser=window.setTimeout(()=>audioManager.playImpactOverlay(`${import.meta.env.BASE_URL}sfx/${arrival.toLowerCase()}-riser.wav`,arrival==='CHAMPION'?60:56,7),Math.max(0,timing.landing-riserMs));
      audioManager.preloadAttackSounds([`${import.meta.env.BASE_URL}sfx/${arrival.toLowerCase()}-slam.wav`]);
      audioManager.duckForPresentation(.6,timing.landing+600);
      const w=source.width*targetScale*pose.boost,h=source.height*targetScale*pose.boost;
      clearBuildup=spawnArrivalBuildup({x:targetLeft+(pose.dx??0)+w/2,y:targetTop-pose.lift+h/2,size:Math.max(w,h),kind:arrival,start:Math.max(0,hangStart-160),landing:timing.landing,title:definition?.name});
      try{aura=cardRef.current?.animate(arrivalAuraFrames(arrival,hangStart-120,timing.landing,duration),{duration,easing:'linear',fill:'both'});}catch{}
      if(arrival==='CHAMPION')try{tremor=cardRef.current?.animate(arrivalTremorFrames(hangStart,timing.landing,duration),{duration,easing:'linear',fill:'both'});}catch{}
    }
    const finish=()=>{
      if(completedRef.current)return;completedRef.current=true;onCompleteRef.current();
    };
    const land=()=>{
      if(landedRef.current||document.hidden)return;
      landedRef.current=true;setLanded(true);onLandRef.current?.(animation.card.instanceId);
      const x=targetLeft+source.width*targetScale/2,y=targetTop+source.height*targetScale/2;
      // Dust rolls out from under the card; heavier cards throw more of it.
      if(arrival&&!reduced){
        const w=source.width*targetScale,h=source.height*targetScale;
        spawnArrivalBlast({x,y,width:w,height:h,kind:arrival});
        // A champion hits hard enough to crack the floor around its slot.
        if(arrival==='CHAMPION')spawnImpactBurst({x,y:y+h*.35,dx:0,dy:1,damage:12,finisher:true,crackAt:{x,y}});
      }
      if(animation.kind==='WRESTLER'&&!reduced)spawnLandingDust({left:targetLeft,top:targetTop,width:source.width*targetScale,height:source.height*targetScale,weight:profile.rarity==='CHAMPION'||profile.rarity==='LEGENDARY'?5:impactRank(profile)+(impactCost>=3?.5:0)});
      const accepted=screenRef.current.request({id:'landing:'+occurrenceId+':'+animation.card.instanceId,profile,x,y,direction:{x:0,y:1},nearby:impactRank(profile)>=3});
      if(!accepted&&screenRef.current.isActive())return;
      const file=impactRank(profile)>=4?'very-heavy':impactRank(profile)>=3?'heavy':impactRank(profile)>=2?'normal':'light';
      const priority=profile.rarity==='CHAMPION'?8:profile.rarity==='LEGENDARY'?7:impactRank(profile)>=3?6:4;
      if(arrival){
        audioManager.playImpactOverlay(`${import.meta.env.BASE_URL}sfx/${arrival.toLowerCase()}-slam.wav`,arrival==='CHAMPION'?82:78,priority);
        audioManager.duckForPresentation(.45,1400);
      }else audioManager.playImpactOverlay(`${import.meta.env.BASE_URL}sfx/impact-${file}.wav`,impactRank(profile)>=3?65:36,priority);
      if(profile.bass&&!arrival)audioManager.playImpactOverlay(`${import.meta.env.BASE_URL}sfx/summon-bass-${profile.bass}.wav`,profile.rarity==='CHAMPION'?78:profile.rarity==='LEGENDARY'?58:60,priority);
      if(impactRank(profile)>=3)audioManager.duckForPresentation(.55,profile.duration+100);
      if(hapticsEnabled&&!reduced&&window.matchMedia('(pointer: coarse)').matches&&typeof navigator.vibrate==='function'&&(impactCost>=5||profile.rarity==='LEGENDARY'||profile.rarity==='CHAMPION'))navigator.vibrate(impactRank(profile)>=4?55:30);
    };
    let shadow:Animation|undefined;
    if(animation.kind==='WRESTLER'){
      try {shadow=shadowRef.current?.animate(summonShadowFrames(timing.landing,duration,reduced),{duration,easing:'linear',fill:'both'});}catch{}
      if(profile.bass)audioManager.preloadAttackSounds([`${import.meta.env.BASE_URL}sfx/summon-bass-${profile.bass}.wav`]);
      try{motion=cardRef.current?.animate(summonFrames(source,{left:targetLeft,top:targetTop},targetScale,profile,timing.landing,duration,reduced,pose),{duration,easing:'linear',fill:'both'});}catch{/* Time-based visual fallback only. */}
      const tick=(now:number)=>{
        if(Number(motion?.currentTime??now-origin)>=timing.landing)land();
        if(!completedRef.current)frame=requestAnimationFrame(tick);
      };
      frame=requestAnimationFrame(tick);
      if(motion)motion.onfinish=()=>{land();finish();};
    }
    const spellImpact=animation.kind==='TECHNIQUE'&&(finisherSpell||hasBoardWideImpact(definition?.abilities))?window.setTimeout(()=>{if(!finisherSpell)audioManager.playImpactOverlay(import.meta.env.BASE_URL+'sfx/spell-impact.wav',40,6);screenRef.current.request({id:'spell-impact:'+occurrenceId,profile:finisherSpell?summonImpact(6,'CHAMPION'):summonImpact(Math.max(5,impactCost)),x:innerWidth/2,y:innerHeight*.45,radial:true,nearby:true});},finisherSpell?Math.round(duration*.78):Math.min(360,Math.round(duration*.28))):null;
    // Spells burn away into arcane dust once they have been read.
    let burn:Animation|undefined;
    const burnAt=Math.round(duration*.78);
    // Finisher spell: the lights go out, FINISHER cinema bars, red lightning and a trembling card,
    // then the card bursts with a champion-class slam as it burns away.
    let clearFinisher=()=>{},finisherTremor:Animation|undefined,finisherRiser:number|null=null;
    if(finisherSpell&&!reduced&&!document.hidden){
      const w=source.width*targetScale,h=source.height*targetScale;
      clearFinisher=spawnArrivalBuildup({x:targetLeft+w/2,y:targetTop+h/2,size:Math.max(w,h)*.8,kind:'CHAMPION',start:120,landing:burnAt,title:definition?.name,tag:'FINISHER'});
      try{finisherTremor=cardRef.current?.animate(arrivalTremorFrames(Math.round(duration*.3),burnAt,duration),{duration,easing:'linear',fill:'both'});}catch{}
      finisherRiser=window.setTimeout(()=>audioManager.playImpactOverlay(import.meta.env.BASE_URL+'sfx/champion-riser.wav',60,8),Math.max(0,burnAt-1150));
      audioManager.duckForPresentation(.45,burnAt+900);
    }
    const burnTimer=animation.kind==='TECHNIQUE'&&!reduced?window.setTimeout(()=>{
      const node=cardRef.current;if(!node||document.hidden)return;
      const r=node.getBoundingClientRect();
      spawnSpellDissolve({left:r.left,top:r.top,width:r.width,height:r.height,finisher:finisherSpell});
      node.classList.add('ko-spell-burning');
      try{burn=node.animate(spellBurnFrames(finisherSpell),{duration:Math.max(200,duration-burnAt-40),easing:'cubic-bezier(.4,0,.8,.6)',fill:'forwards'});}catch{}
      audioManager.playImpactOverlay(import.meta.env.BASE_URL+'sfx/spell-dissolve.wav',finisherSpell?36:28,5);
      if(finisherSpell){
        const cx=r.left+r.width/2,cy=r.top+r.height/2;
        spawnArrivalBlast({x:cx,y:cy,width:r.width*.8,height:r.height*.8,kind:'CHAMPION'});
        spawnImpactBurst({x:cx,y:cy+r.height*.3,dx:0,dy:1,damage:15,finisher:true,crackAt:{x:cx,y:cy+r.height*.3}});
        audioManager.playImpactOverlay(import.meta.env.BASE_URL+'sfx/champion-slam.wav',82,9);
      }
    },burnAt):null;
    setReading(false);
    const readTimer=animation.kind==='TECHNIQUE'?window.setTimeout(()=>{setReading(true);readableRef.current?.();},Math.min(360,duration)):null;
    const fallback=window.setTimeout(finish,animation.kind==='TECHNIQUE'?duration:duration+120);
    const resized=()=>{if(animation.kind==='WRESTLER')finish();};
    const hidden=()=>{if(document.hidden)finish();};
    window.addEventListener('resize',resized);document.addEventListener('visibilitychange',hidden);
    return()=>{clearTimeout(fallback);if(burnTimer!==null)clearTimeout(burnTimer);if(finisherRiser!==null)clearTimeout(finisherRiser);finisherTremor?.cancel();clearFinisher();burn?.cancel();cardRef.current?.classList.remove('ko-spell-burning');if(riser!==null)clearTimeout(riser);aura?.cancel();tremor?.cancel();clearBuildup();if(readTimer!==null)clearTimeout(readTimer);if(spellImpact!==null)clearTimeout(spellImpact);cancelAnimationFrame(frame);shadow?.cancel();if(motion){motion.onfinish=null;motion.cancel();}window.removeEventListener('resize',resized);document.removeEventListener('visibilitychange',hidden);};
  },[animation.card.instanceId,occurrenceId,animation.kind,duration,targetLeft,targetTop,targetScale]);

  function complete(event: React.AnimationEvent<HTMLDivElement>) {
    if(animation.kind==='TECHNIQUE')return;
    if (event.target !== event.currentTarget ||
        !['ko-card-play-wrestler','ko-cinematic-card-reduced'].includes(event.animationName)) return;
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
      data-play-instance={animation.card.instanceId}
      data-spell-reading={reading}
      data-finisher-spell={finisherSpell}
      data-play-landed={landed ? "true" : "false"}
      aria-hidden={animation.kind === "WRESTLER"}
      className={`card-play-animation ${animation.kind==='WRESTLER'?'ko-summon-motion':''} ${animation.kind==='WRESTLER'&&(animation.card.currentCost>=6||definition?.rarity==='CHAMPION'||definition?.rarity==='LEGENDARY')?'ko-summon-heavy':''} ${animationClass} card-play-animation--rarity-${rarity.toLowerCase()}`}
      style={style}
    >
      {target && <div ref={shadowRef} className="ko-summon-shadow" data-testid="summon-landing-shadow" aria-hidden="true" style={{left:target.left+target.width*.08,top:target.top+target.height-10,width:target.width*.84,height:Math.max(8,Math.min(22,target.height*.09))}}/>}
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

      <div
        ref={cardRef}
        className="card-play-animation__card"
        onAnimationEnd={complete}
      >
        <CardRenderer cardId={animation.card.definitionId} cosmeticOwnerId={animation.playerId}
          name={definition?.name ?? "카드"}
          cardType={animation.kind}
          cost={animation.card.currentCost}
          attack={animation.card.currentAttack}
          health={animation.card.currentHealth}
          rulesText={getCardRuntimeRulesText(animation.card, definition?.rulesText ?? "")}
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
