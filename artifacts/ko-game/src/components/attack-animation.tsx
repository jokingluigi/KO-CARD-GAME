import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {useScreenImpact} from './screen-impact';
import {damageImpact} from './screen-impact-policy';
import { useCinematicEvent } from './cinematic-layer';
import { CardRenderer } from "./card-renderer";
import { getCardDefinition } from "@/game";
import { getActiveCardKeywords } from "../game/cards/granted-text";
import { getCardRuntimeRulesText } from "../lib/card-display-state";
import type { AttackAnimationState } from "./attack-animation-utils";
import { readCombatPreferences } from './combat-preferences';
import { combatTimeline, attackFrames, targetReactionFrames, attackBurstKind } from './battle-vfx-model';
import { BattleVfx } from './battle-vfx';
import { audioManager } from '../audio/audio-manager';
import { prefersReducedMotion } from "./presentation-config";

export function AttackAnimation({
  animation,
  onImpact,
  onComplete,
  hapticsEnabled = false,
}: {
  animation: AttackAnimationState;
  onImpact: () => void;
  onComplete: () => void;
  hapticsEnabled?: boolean;
}) {
  const screen=useScreenImpact(),screenRef=useRef(screen);screenRef.current=screen;
  const impactedRef = useRef(false);
  const completedRef = useRef(false);
  const onImpactRef = useRef(onImpact);
  const onCompleteRef = useRef(onComplete);
  const attackerRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<HTMLDivElement>(null);
  const [released,setReleased] = useState(false);
  const hapticsRef=useRef(hapticsEnabled);
  hapticsRef.current=hapticsEnabled;
  const [impacted,setImpacted] = useState(false);
  onImpactRef.current = onImpact;
  onCompleteRef.current = onComplete;
  const definition = getCardDefinition(animation.attacker.definitionId);
  const geometryRef=useRef({id:animation.soundKey,value:animation.geometry});
  if(geometryRef.current.id!==animation.soundKey)geometryRef.current={id:animation.soundKey,value:animation.geometry};
  const { source, target } = geometryRef.current.value;
  useCinematicEvent({id:`attack:${animation.soundKey}`,kind:animation.finishingBlow ? 'FINISHER' : 'ATTACK',title:definition?.name ?? 'KO',art:definition?.imageUrl,strength:animation.damage,focus:{x:target.left+target.width/2,y:target.top+target.height/2}});
  const reduced = prefersReducedMotion();
  const timeline = combatTimeline(animation.currentAttack,animation.damage,animation.finishingBlow,reduced);
  const {duration,impact:impactDelay} = timeline;
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
    "--attack-travel-angle": `${Math.atan2(dy,dx)*180/Math.PI}deg`,
    "--attack-travel-length": `${Math.hypot(dx,dy)}px`,
  } as CSSProperties;

  useEffect(() => {
    impactedRef.current = false;
    completedRef.current = false;
    setImpacted(false);
    setReleased(false);
    let releasedOnce=false;
    if (animation.finishingBlow) audioManager.duckForPresentation(.4, 500);
    const impact = () => {
      if (impactedRef.current) return;
      impactedRef.current = true;
      setImpacted(true);
      if(phaseRef.current)phaseRef.current.dataset.attackPhase='HITSTOP';
      if(hapticsRef.current && animation.damage>0 && !reduced && window.matchMedia?.('(pointer: coarse)').matches && typeof navigator.vibrate==='function') {
        navigator.vibrate(animation.finishingBlow?70:animation.damage>=10?55:animation.damage>=6?35:12);
      }
      if (!document.hidden) screenRef.current.request({id:'attack-impact:'+animation.soundKey,profile:damageImpact(animation.damage,Boolean(animation.finishingBlow)),x:target.left+target.width/2,y:target.top+target.height/2,direction:{x:dx,y:dy}});
      if(animation.damage>=6&&!document.hidden)audioManager.playImpactOverlay(import.meta.env.BASE_URL+'sfx/summon-bass-'+(animation.finishingBlow?'massive':'heavy')+'.wav',animation.finishingBlow?48:32,8);
      onImpactRef.current();
    };
    const release = () => {
      if(releasedOnce)return; releasedOnce=true; setReleased(true);
      if(phaseRef.current)phaseRef.current.dataset.attackPhase='REACTION';

    };
    const complete = () => {
      if (completedRef.current) return;
      impact();
      releasedOnce=true;
      completedRef.current = true;
      onCompleteRef.current();
    };
    const animate=(node:HTMLElement|null,frames:Keyframe[])=>{try{return node?.animate?.(frames,{duration,fill:'both',easing:'linear'});}catch{return undefined;}};
    const element=attackerRef.current;
    const motion=animate(element,attackFrames(dx,dy,timeline,reduced));
    const targetMotion=animate(targetRef.current,targetReactionFrames(dx,dy,animation.damage,timeline,reduced));
    const origin=performance.now();
    let frame=0;
    const tick=(now:number)=>{
      // Read the same animation clock used by the moving card, including hit stop.
      const time=Number(motion?.currentTime ?? now-origin);
      if(time>=impactDelay) impact();
      else if(phaseRef.current)phaseRef.current.dataset.attackPhase=time<100?'ANTICIPATION':'ACCELERATION';
      if(time>=timeline.release)release();
      if(time>=duration*.84&&phaseRef.current)phaseRef.current.dataset.attackPhase='RECOVERY';
      if(!completedRef.current) frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    if(motion) motion.onfinish=complete;
    const completeTimer = window.setTimeout(complete,duration+120);
    const hidden=()=>{if(document.hidden) complete();};
    document.addEventListener('visibilitychange',hidden);
    window.addEventListener('resize',complete);
    window.addEventListener('ko-combat-preferences',complete);
    return () => {
      cancelAnimationFrame(frame);
      if(motion){motion.onfinish=null;motion.cancel();}
      targetMotion?.cancel();
      document.removeEventListener('visibilitychange',hidden);
      window.removeEventListener('resize',complete);
      window.removeEventListener('ko-combat-preferences',complete);
      window.clearTimeout(completeTimer);
    };
  }, [animation.soundKey,duration,impactDelay,timeline.release,dx,dy,reduced]);

  const impactClass = `attack-animation--${animation.damage>=10?'very_heavy':animation.damage>=6?'heavy':animation.damage>=3?'normal':'light'}`;
  const rarity = definition?.rarity ?? "NORMAL";

  return (
    <div
      aria-hidden="true"
      ref={phaseRef} data-attack-phase="ANTICIPATION" data-hitstop-ms={timeline.release-timeline.impact}
      className={`attack-animation attack-animation--cinematic ${impacted?'attack-animation--impacted':''} ${impactClass} attack-animation--rarity-${rarity.toLowerCase()} ${animation.target && animation.damage >= animation.target.currentHealth + 3 ? 'attack-animation--overkill' : ''} ${animation.finishingBlow ? "attack-animation--finisher" : ""}`}
      style={style}
    >
      {animation.finishingBlow && released && <div className="attack-animation__finisher"><div className="attack-animation__finisher-slash" /></div>}
      <div className="attack-animation__windup" />
      {!reduced && <div className="attack-animation__trail" />}
      <div className="attack-animation__target" ref={targetRef}>
        {animation.targetKind === "CARD" && animation.target ? (
          <CardRenderer
            name={getCardDefinition(animation.target.definitionId)?.name ?? "대상"}
            cardType={animation.target.cardType}
            cost={animation.target.currentCost}
            attack={animation.target.currentAttack}
            health={animation.target.currentHealth}
            rulesText={getCardRuntimeRulesText(animation.target, getCardDefinition(animation.target.definitionId)?.rulesText ?? "효과 없음")}
            imageUrl={getCardDefinition(animation.target.definitionId)?.imageUrl}
            rarity={getCardDefinition(animation.target.definitionId)?.rarity}
            size="board"
            imageDisplaySettings={getCardDefinition(animation.target.definitionId)}
            runtimeKeywords={getActiveCardKeywords(animation.target)}
            isSilenced={animation.target.isSilenced}
            isStunned={animation.target.isStunned}
            isAbilityDisabled={animation.target.isAbilityDisabled}
            className="h-full w-full"
          />
        ) : (
          <div className="attack-animation__champion-impact" />
        )}
      </div>
      {!reduced && readCombatPreferences().quality!=='LOW' && animation.damage>=6 && definition?.imageUrl && [0,1].slice(0,readCombatPreferences().quality==='MEDIUM'?1:2).map(i=><div key={i} className="ko-attack-ghost" style={{backgroundImage:`url("${definition.imageUrl}")`,animationDelay:`${i*25}ms`}} />)}
      <div className="attack-animation__attacker" ref={attackerRef}>
        {!reduced && animation.damage>=6 && definition?.imageUrl && <img className="ko-attack-breakout" src={definition.imageUrl} alt="" onError={e=>{e.currentTarget.style.visibility='hidden';}} />}

        <CardRenderer
          name={definition?.name ?? "공격 카드"}
          cardType={animation.attacker.cardType}
          cost={animation.attacker.currentCost}
          attack={animation.attacker.currentAttack}
          health={animation.attacker.currentHealth}
          rulesText={getCardRuntimeRulesText(animation.attacker, definition?.rulesText ?? "효과 없음")}
          imageUrl={definition?.imageUrl}
          rarity={definition?.rarity}
          size="board"
          imageDisplaySettings={definition}
          runtimeKeywords={getActiveCardKeywords(animation.attacker)}
          isSilenced={animation.attacker.isSilenced}
          isStunned={animation.attacker.isStunned}
          isAbilityDisabled={animation.attacker.isAbilityDisabled}
          className="h-full w-full"
        />
      </div>
      {impacted && <>
        {!reduced && animation.damage>=6 && <div className={`ko-impact-frame ${animation.finishingBlow?'ko-impact-frame--finisher':''}`} />}

        {impacted && <BattleVfx kind={attackBurstKind(animation)} left={target.left+target.width/2} top={target.top+target.height/2}
          strength={animation.damage} seed={animation.soundKey} duration={Math.min(500,duration-timeline.release)} />}
        {impacted && animation.damage>=3 && <div className="attack-animation__shockwave" />}
        <div className="attack-animation__impact-flash" />
      </>}
    </div>
  );
}
