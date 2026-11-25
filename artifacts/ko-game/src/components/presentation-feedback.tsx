import "./effect-readability.css";

import {audioManager} from '../audio/audio-manager';
import {useScreenImpact} from './screen-impact';
import {damageImpact} from './screen-impact-policy';
import {spawnHealGlow,spawnTurnBanner} from './battle-moments';
import {spawnImpactBurst} from './impact-burst';
import {juiceForCue} from './battle-juice-cues';
import {panAt} from './battle-juice';
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { PresentationCueDraft } from "./presentation-feedback-utils";
import { damageNumberTier } from './presentation-policy';

export type PresentationCue = PresentationCueDraft & {

  targetWidth?:number;
  left: number;
  top: number;
  sourceLeft?: number;
  sourceTop?: number;
  previousArtwork?: string;
  nextArtwork?: string;
};

const toneClass: Record<PresentationCue["kind"], string> = {
  EFFECT: "presentation-feedback--effect",
  SILENCE: "presentation-feedback--silence",
  ARMOR: "presentation-feedback--armor",
  DAMAGE: "presentation-feedback--damage",
  DODGE: "presentation-feedback--dodge",
  BLOCK: "presentation-feedback--dodge",
  HEAL: "presentation-feedback--heal",
  MAX_HEALTH:"presentation-feedback--capacity",
  PROTECTION_BREAK:"presentation-feedback--protection-break",
  BUFF: "presentation-feedback--buff",
  DEBUFF: "presentation-feedback--debuff",
  RETIRE: "presentation-feedback--retire",
  DESTROY: "presentation-feedback--destroy",
  REMOVE: "presentation-feedback--remove",
  DRAW: "presentation-feedback--draw",
  GENERATE: "presentation-feedback--generate",
  TRANSFORM: "presentation-feedback--transform",
  QUEST_PROGRESS: "presentation-feedback--quest",
  QUEST_COMPLETE: "presentation-feedback--quest-complete",
  GOLD: "presentation-feedback--gold",
  TURN: "presentation-feedback--turn",
};

export function PresentationFeedback({
  cue,
  onComplete,
  onStart,
  lethal=false,
  delay=0,
}: {
  cue: PresentationCue;
  onComplete: () => void;
  onStart?: (cue: PresentationCue) => void;
  lethal?:boolean;
  /** 3. 광역 피해 물결: 같은 순간 여러 장이 맞으면 가까운 카드부터 조금씩 늦게 */
  delay?:number;
}) {
  const [ready,setReady]=useState(delay<=0);
  useEffect(()=>{if(delay<=0){setReady(true);return;}setReady(false);const t=window.setTimeout(()=>setReady(true),delay);return()=>window.clearTimeout(t);},[cue.id,delay]);
  const spriteDamage=cue.kind==='DAMAGE'&&Boolean(cue.playerId)&&!cue.cardInstanceId;
  const screen=useScreenImpact(),screenRef=useRef(screen);screenRef.current=screen;
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onStartRef=useRef(onStart);
  const startedCueRef=useRef('');
  onStartRef.current=onStart;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if(!ready)return;
    completedRef.current = false;
    if(!cue.quiet&&cue.kind==='DAMAGE'&&!cue.combat&&!spriteDamage&&!cue.selfDamage)screenRef.current.request({id:'effect-impact:'+cue.id,profile:damageImpact(cue.value??0,lethal),x:cue.left,y:cue.top,radial:true});
    // Effect damage gets the same hit burst as combat, scaled by damage (finisher-class at 10+).
    if(!cue.quiet&&cue.kind==='DAMAGE'&&!cue.combat&&!cue.selfDamage&&(cue.value??0)>0&&!document.hidden)spawnImpactBurst({x:cue.left,y:cue.top,dx:0,dy:1,damage:cue.value??0,finisher:(cue.value??0)>=10,crackAt:(cue.value??0)>=6?{x:cue.left,y:cue.top}:undefined});
    if(startedCueRef.current!==cue.id){startedCueRef.current=cue.id;
      const sound:Partial<Record<PresentationCue['kind'],string>>={ARMOR:'../hs-mixes/armor.wav',BLOCK:'../hs-mixes/armor.wav',DESTROY:'../hs-mixes/card-destroy.wav',RETIRE:'../hs-mixes/card-retire.wav',HEAL:'../hs-mixes/heal.wav',BUFF:'../hs-mixes/heal.wav',DRAW:'../hs-mixes/card-draw.wav',TURN:'../hs-mixes/turn-start.wav',GOLD:'rpg/handle_coins.ogg'};
      const volume:Partial<Record<PresentationCue['kind'],number>>={TURN:46,DESTROY:56,RETIRE:55,DRAW:34,HEAL:40,BUFF:32};
      if(!cue.quiet&&sound[cue.kind])audioManager.playImpactOverlay(import.meta.env.BASE_URL+'vendor/kenney/'+sound[cue.kind],volume[cue.kind]??40,cue.kind==='TURN'||cue.kind==='DESTROY'?6:4,{pan:cue.kind==='TURN'?undefined:panAt(cue.left)});
      if(!cue.quiet)try{juiceForCue(cue,lethal);}catch{/* visual only */}
      if(!cue.quiet&&cue.kind==='HEAL')spawnHealGlow({x:cue.left,y:cue.top,size:Math.max(80,Math.min(160,cue.targetWidth??110))});
      if(!cue.quiet&&cue.kind==='TURN')spawnTurnBanner(cue.label==='YOUR TURN',cue.label==='YOUR TURN'?'YOUR TURN':'상대 턴');
      if(!cue.quiet)onStartRef.current?.(cue);
    }
    const timeoutId = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current();
    }, cue.duration);
    return () => window.clearTimeout(timeoutId);
  }, [cue.duration, cue.id, ready]);

  const style = {
    "--presentation-left": `${cue.left}px`,
    "--presentation-top": `${cue.top}px`,
    "--presentation-duration": `${cue.duration}ms`,
    "--presentation-source-x": `${(cue.sourceLeft ?? cue.left) - cue.left}px`,
    "--presentation-source-y": `${(cue.sourceTop ?? cue.top) - cue.top}px`,
  } as CSSProperties;

  if(!ready)return null;
  return (
    <>

    <div
      aria-hidden="true"
      className={`presentation-feedback ${toneClass[cue.kind]}`}
      data-impact={cue.kind==='DAMAGE' ? damageNumberTier(cue.value??0) : undefined}
      style={style}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (completedRef.current) return;
        completedRef.current = true;
        onCompleteRef.current();
      }}
    >

      {!cue.quiet && cue.kind === "TRANSFORM" && cue.previousArtwork && cue.nextArtwork &&
        <span className="presentation-feedback__morph" aria-hidden="true">
          <img src={cue.previousArtwork} alt="" className="presentation-feedback__morph-before" />
          <img src={cue.nextArtwork} alt="" className="presentation-feedback__morph-after" />
        </span>}

      <span className="presentation-feedback__label">{cue.label}</span>
      {cue.kind === "QUEST_PROGRESS" && cue.value ? <small>+{cue.value}</small> : null}
    </div>
    </>
  );
}
