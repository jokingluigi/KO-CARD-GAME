import "./effect-readability.css";
import {audioManager} from '../audio/audio-manager';
import {useScreenImpact} from './screen-impact';
import {damageImpact} from './screen-impact-policy';
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import type { PresentationCueDraft } from "./presentation-feedback-utils";
import { damageNumberTier } from './presentation-policy';
import { BattleVfx } from './battle-vfx';

export type PresentationCue = PresentationCueDraft & {
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
}: {
  cue: PresentationCue;
  onComplete: () => void;
  onStart?: (cue: PresentationCue) => void;
  lethal?:boolean;
}) {
  const spriteDamage=cue.kind==='DAMAGE'&&Boolean(cue.playerId)&&!cue.cardInstanceId;
  const screen=useScreenImpact(),screenRef=useRef(screen);screenRef.current=screen;
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onStartRef=useRef(onStart);
  const startedCueRef=useRef('');
  onStartRef.current=onStart;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    completedRef.current = false;
    if(!cue.quiet&&cue.kind==='DAMAGE'&&!cue.combat&&!spriteDamage&&!cue.selfDamage)screenRef.current.request({id:'effect-impact:'+cue.id,profile:damageImpact(cue.value??0,lethal),x:cue.left,y:cue.top,radial:true});
    if(startedCueRef.current!==cue.id){startedCueRef.current=cue.id;
      const sound:Partial<Record<PresentationCue['kind'],string>>={ARMOR:'impact/impact_metal_medium_000.ogg',BLOCK:'impact/impact_metal_medium_000.ogg',DESTROY:'impact/impact_glass_heavy_000.ogg',RETIRE:'impact/impact_soft_heavy_000.ogg',GOLD:'rpg/handle_coins.ogg'};
      if(!cue.quiet&&sound[cue.kind])audioManager.playImpactOverlay(import.meta.env.BASE_URL+'vendor/kenney/'+sound[cue.kind],40,4);
      if(!cue.quiet)onStartRef.current?.(cue);
    }
    const timeoutId = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current();
    }, cue.duration);
    return () => window.clearTimeout(timeoutId);
  }, [cue.duration, cue.id]);

  const style = {
    "--presentation-left": `${cue.left}px`,
    "--presentation-top": `${cue.top}px`,
    "--presentation-duration": `${cue.duration}ms`,
    "--presentation-source-x": `${(cue.sourceLeft ?? cue.left) - cue.left}px`,
    "--presentation-source-y": `${(cue.sourceTop ?? cue.top) - cue.top}px`,
  } as CSSProperties;

  return (
    <>
    {!cue.quiet && (cue.kind==='DAMAGE'&&!cue.combat&&!spriteDamage&&!cue.selfDamage || (['DESTROY','BLOCK','ARMOR','HEAL','REMOVE','RETIRE','GOLD','PROTECTION_BREAK'].includes(cue.kind)&&!(cue.kind==='HEAL'&&cue.playerId&&!cue.cardInstanceId))) &&
      <BattleVfx kind={cue.kind==='DAMAGE'?'IMPACT':cue.kind==='PROTECTION_BREAK'?'ARMOR':cue.kind==='ARMOR'?'ARMOR':cue.kind==='BLOCK'?'BLOCK':cue.kind==='HEAL'?'HEAL':cue.kind==='REMOVE'?'MAGIC':cue.kind==='RETIRE'?'RETIRE':cue.kind==='GOLD'?'GOLD':'DESTROY'}
        left={cue.left} top={cue.top} strength={Math.abs(cue.value??3)} seed={cue.id} duration={cue.duration} />}
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
      {!cue.quiet&&cue.kind==='DAMAGE'&&!cue.combat&&!spriteDamage&&!cue.selfDamage&&<i className="presentation-feedback__effect-hit"/>}
      {!cue.quiet&&cue.kind==='ARMOR'&&<i className="presentation-feedback__shield"/>}
      {!cue.quiet && cue.kind==='SILENCE'&&<i className="presentation-feedback__silence-ring"/>}
      {!cue.quiet && cue.sourceLeft !== undefined && cue.sourceTop !== undefined &&
        (Math.abs(cue.sourceLeft - cue.left) + Math.abs(cue.sourceTop - cue.top) > 30) &&
        <img alt="" src={`${import.meta.env.BASE_URL}vendor/kenney/particle/star_01.png`} className="presentation-feedback__transfer"/>}
      {!cue.quiet && cue.kind === "TRANSFORM" && cue.previousArtwork && cue.nextArtwork &&
        <span className="presentation-feedback__morph" aria-hidden="true">
          <img src={cue.previousArtwork} alt="" className="presentation-feedback__morph-before" />
          <img src={cue.nextArtwork} alt="" className="presentation-feedback__morph-after" />
        </span>}
      {cue.kind==="MAX_HEALTH"&&!cue.quiet&&<i className="ko-capacity-expand"/>}
      <span className="presentation-feedback__label">{cue.label}</span>
      {cue.kind === "QUEST_PROGRESS" && cue.value ? <small>+{cue.value}</small> : null}
    </div>
    </>
  );
}
