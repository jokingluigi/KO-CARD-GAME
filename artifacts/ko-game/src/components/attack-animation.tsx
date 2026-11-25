import {createPortal} from 'react-dom';
import {combatContact} from './combat-contact';
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {useScreenImpact} from './screen-impact';
import {damageImpact,impactRank} from './screen-impact-policy';
import { CardRenderer } from "./card-renderer";
import { getCardDefinition } from "@/game";
import { getActiveCardKeywords } from "../game/cards/granted-text";
import { getCardRuntimeRulesText } from "../lib/card-display-state";
import type { AttackAnimationState } from "./attack-animation-utils";
import { readCombatPreferences } from './combat-preferences';
import { combatTimeline, attackFrames, targetReactionFrames } from './battle-vfx-model';

import { audioManager } from '../audio/audio-manager';
import { prefersReducedMotion } from "./presentation-config";
import { spawnDamageBadge, spawnImpactBurst } from './impact-burst';
import { spawnPortraitCracks } from './battle-moments';
import { hitForce, kickBoard } from './card-physics';
import { attackJuice } from './battle-juice-cues';
import { impactBurstProfile, shudderFrames } from './impact-burst-model';
import { attackSpotlight, counterRecoil, preImpactVacuum, soundLead } from './hit-feel';

export function AttackAnimation({
  animation,
  onImpact,
  onImpactSound,
  slowMotion = false,
  onComplete,
  hapticsEnabled = false,
}: {
  animation: AttackAnimationState;
  onImpact: () => void;
  /** 1. 소리 지연 보정: 맞는 소리만 기기 지연만큼 먼저 튼다 (화면·체력 반영은 그대로 맞는 순간). */
  onImpactSound?: () => void;
  /** Lethal blow: the whole strike plays in slow motion with a longer hit-stop. */
  slowMotion?: boolean;
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
  const onImpactSoundRef = useRef(onImpactSound);
  onImpactSoundRef.current = onImpactSound;
  const definition = getCardDefinition(animation.attacker.definitionId);
  const geometryRef=useRef({id:animation.soundKey,value:animation.geometry});
  if(geometryRef.current.id!==animation.soundKey)geometryRef.current={id:animation.soundKey,value:animation.geometry};
  const { source, target } = geometryRef.current.value;
  const reduced = prefersReducedMotion();
  const baseTimeline = combatTimeline(animation.currentAttack,animation.damage,animation.finishingBlow,reduced);
  const slow = slowMotion && !reduced;
  const timeline = slow
    ? { duration: Math.round(baseTimeline.duration*2.4 + 260), impact: Math.round(baseTimeline.impact*2.4), release: Math.round(baseTimeline.impact*2.4 + (baseTimeline.release-baseTimeline.impact)*2 + 260) }
    : baseTimeline;
  const {duration,impact:impactDelay} = timeline;
  const {dx,dy,x:contactX,y:contactY} = combatContact(source,target);
  const style = {
    "--attack-source-x": `${source.left}px`,
    "--attack-source-y": `${source.top}px`,
    "--attack-source-width": `${source.width}px`,
    "--attack-source-height": `${source.height}px`,
    "--attack-contact-x": `${contactX}px`,
    "--attack-contact-y": `${contactY}px`,
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
    let hush:Animation|undefined;
    // Card being hit flashes white for the hit-stop, then cools back down.
    let whiteNode:HTMLElement|null|undefined;
    let whiteout:Animation|undefined;
    let shudder:Animation|undefined;
    let healthPop:Animation|undefined;
    if (animation.finishingBlow) audioManager.duckForPresentation(.4, 500);
    let soundPlayed=false,vacuumed=false;
    // 3차 5. 공격력 6 이상: 예비 동작 동안 주변이 어두워지고 공격자·대상에만 빛
    const closeSpot=animation.currentAttack>=6&&!document.hidden
      ? attackSpotlight(
          {x:source.left+source.width/2,y:source.top+source.height/2,r:Math.max(source.width,source.height)*.62},
          {x:target.left+target.width/2,y:target.top+target.height/2,r:Math.max(target.width,target.height)*.62},
          Math.max(120,impactDelay*.7))
      : ()=>{};
    const lead=reduced?0:soundLead();
    const playImpactSound=()=>{if(soundPlayed)return;soundPlayed=true;try{onImpactSoundRef.current?.();}catch{/* 소리 */}};
    const impact = () => {
      if (impactedRef.current) return;
      impactedRef.current = true;
      playImpactSound();
      closeSpot();
      setImpacted(true);
      if(animation.finishingBlow&&!reduced)try{hush=document.querySelector(".ko-cinematic-background")?.animate([{filter:"brightness(.6)"},{filter:"brightness(1)"}],{duration:220,easing:"ease-out"});}catch{}

      if(phaseRef.current)phaseRef.current.dataset.attackPhase='HITSTOP';
      // Slam layers outlive this portal (dust settles, badge holds) so they are spawned on <body>.
      if(!document.hidden&&animation.damage>0){
        spawnImpactBurst({x:contactX,y:contactY,dx,dy,damage:animation.damage,finisher:Boolean(animation.finishingBlow),reduced,crackAt:{x:target.left+target.width/2,y:target.top+target.height/2}});
        // The struck card's own number sits under this portal's copy of it; show the badge on top.
        if(animation.targetKind==='CHAMPION'&&!championNode?.querySelector('.ko-sprite-visual'))spawnPortraitCracks(whiteNode??null,animation.damage);
        if(animation.targetKind==='CARD')spawnDamageBadge({x:target.left+target.width/2,y:target.top+target.height/2,damage:animation.damage,finisher:Boolean(animation.finishingBlow),reduced});
      }
      const burst=impactBurstProfile(animation.damage,Boolean(animation.finishingBlow),{flash:readCombatPreferences().flash,reduced});
      if(burst&&whiteNode)try{
        const hold=Math.max(40,timeline.release-timeline.impact),total=hold+200;
        whiteout=whiteNode.animate([
          {offset:0,filter:`brightness(${burst.whiteout}) saturate(.2) contrast(1.2)`},
          {offset:hold/total,filter:`brightness(${burst.whiteout}) saturate(.2) contrast(1.2)`},
          {offset:(hold+60)/total,filter:'brightness(1.5) saturate(.7) contrast(1.05)'},
          {offset:1,filter:'brightness(1) saturate(1) contrast(1)'},
        ],{duration:total,easing:'ease-out'});
        // Fighting-game hit-stop: the struck card shudders in place while time is frozen.
        // Uses the separate `translate` property so it stacks on the existing recoil transform.
        // Like a health gem taking a hit: the struck card's health number bulges and flashes.
        const health=whiteNode.querySelector<HTMLElement>('[data-card-stat="health"]');
        if(health)healthPop=health.animate([{scale:'1',color:'#fff'},{offset:.12,scale:'1.75',color:'#fff',filter:'drop-shadow(0 0 6px #ff7a1a)'},{offset:.35,scale:'1.25',color:'#ff5a3a'},{scale:'1',filter:'none'}],{duration:hold+520,easing:'ease-out'});
        if(burst.shake>0)shudder=whiteNode.animate(shudderFrames(burst.shake,Math.max(4,Math.round(hold/16))).map(translate=>({translate,easing:'steps(1,end)'})),{duration:hold+40});
      }catch{}
      if(hapticsRef.current && animation.damage>0 && !reduced && window.matchMedia?.('(pointer: coarse)').matches && typeof navigator.vibrate==='function') {
        navigator.vibrate(animation.finishingBlow?70:animation.damage>=10?55:animation.damage>=6?35:12);
      }
      // Base hit playback clears old overlays; start the new bass layer afterwards.
      onImpactRef.current();
      if(!document.hidden)try{attackJuice(animation,{x:contactX,y:contactY},target);}catch{/* visual only */}
      if (!document.hidden) {
        const profile=damageImpact(animation.damage,Boolean(animation.finishingBlow));
        screenRef.current.request({id:'attack-impact:'+animation.soundKey,profile:{...profile,duration:Math.min(profile.duration,duration-impactDelay-16)},x:contactX,y:contactY,direction:{x:dx,y:dy},nearby:impactRank(profile)>=4});
      }
    };
    const release = () => {
      if(releasedOnce)return; releasedOnce=true; setReleased(true);
      if(phaseRef.current)phaseRef.current.dataset.attackPhase='REACTION';
      // 13. 반격받으면 공격한 카드도 뒤로 튕겨 나간다
      if((animation.counterDamage??0)>0&&animation.targetKind==='CARD')counterRecoil(attackerRef.current,dx,dy,animation.counterDamage??0);

    };
    const complete = () => {
      if (completedRef.current) return;
      impact();
      releasedOnce=true;
      completedRef.current = true;
      // The real struck card reappears from under the attack copy slightly tipped, then settles.
      if(animation.targetKind==='CARD'&&animation.damage>0)kickBoard(target.left+target.width/2,target.top+target.height/2,dx,dy,hitForce(animation.damage,Boolean(animation.finishingBlow)),'only');
      onCompleteRef.current();
    };
    const animate=(node:HTMLElement|null,frames:Keyframe[])=>{try{return node?.animate?.(frames,{duration,fill:'both',easing:'linear'});}catch{return undefined;}};
    const element=attackerRef.current;
    const motion=animate(element,attackFrames(dx,dy,timeline,reduced,animation.currentAttack));
    // Shadow grows while the card lifts toward the camera, then snaps tight on contact.
    let lift:Animation|undefined;
    if(!reduced)try{
      const top=Math.max(timeline.impact*.45,timeline.impact-110)/duration,hit=timeline.impact/duration;
      lift=element?.animate([
        {offset:0,filter:'drop-shadow(0 4px 4px rgba(0,0,0,.35))'},
        {offset:top,filter:'drop-shadow(0 30px 22px rgba(0,0,0,.6))'},
        {offset:hit,filter:'drop-shadow(0 6px 5px rgba(0,0,0,.55))'},
        {offset:1,filter:'drop-shadow(0 4px 4px rgba(0,0,0,.35))'},
      ],{duration,fill:'both'});
    }catch{}
    // A champion hit moves the actual portrait, not an empty circular proxy.
    const championNode=animation.targetKind==='CHAMPION'
      ? Array.from(document.querySelectorAll<HTMLElement>('.ko-player-champion,.ko-opponent-champion')).find(node=>{
          const r=node.getBoundingClientRect();
          return Math.abs(r.left+r.width/2-(target.left+target.width/2))<r.width/2 && Math.abs(r.top+r.height/2-(target.top+target.height/2))<r.height/2;
        }) : undefined;
    const targetMotion=championNode?.querySelector(".ko-sprite-visual")?undefined:animate(championNode??targetRef.current,targetReactionFrames(dx,dy,animation.damage,timeline,reduced));
    // Committed attack only: a short visual focus during existing anticipation,
    // without moving hit areas or adding any timing to the battle.
    const focusNode=championNode?.querySelector<HTMLElement>('.ko-portrait-window')??targetRef.current;
    whiteNode=focusNode;
    let focus:Animation|undefined;
    if(!reduced)try{focus=focusNode?.animate([{filter:'brightness(1)',outline:'1px solid transparent'},{filter:'brightness(1.14)',outline:'2px solid #cbb476'},{filter:'brightness(1)',outline:'1px solid transparent'}],{duration:Math.min(160,impactDelay),easing:'ease-out'});}catch{}
    const origin=performance.now();
    let frame=0;
    let movementPlayed=false;
    const tick=(now:number)=>{
      // Read the same animation clock used by the moving card, including hit stop.
      const time=Number(motion?.currentTime ?? now-origin);
      // The swing whoosh peaks just before contact (it rises over ~200ms), not during the lift.
      if(!movementPlayed && time>=Math.max(60,impactDelay-200) && time<impactDelay && !reduced && !document.hidden) {
        movementPlayed=true;
        audioManager.playImpactOverlay(import.meta.env.BASE_URL+"sfx/combat-movement.wav", 22, 4);
      }
      // 2. 큰 타격 직전 음악이 확 줄었다가(진공) 맞는 순간 돌아온다
      if(!vacuumed&&!animation.finishingBlow&&time>=impactDelay-120&&time<impactDelay){vacuumed=true;preImpactVacuum(animation.damage);}
      // 1. 휴대폰 소리 지연만큼 '퍽' 소리를 먼저
      if(lead>0&&time>=impactDelay-lead)playImpactSound();
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
      closeSpot();
      cancelAnimationFrame(frame);
      if(motion){motion.onfinish=null;motion.cancel();}
      targetMotion?.cancel();hush?.cancel();focus?.cancel();whiteout?.cancel();shudder?.cancel();lift?.cancel();healthPop?.cancel();
      document.removeEventListener('visibilitychange',hidden);
      window.removeEventListener('resize',complete);
      window.removeEventListener('ko-combat-preferences',complete);
      window.clearTimeout(completeTimer);
    };
  }, [animation.soundKey,duration,impactDelay,timeline.release,dx,dy,contactX,contactY,reduced]);

  const impactClass = `attack-animation--${animation.damage>=10?'very_heavy':animation.damage>=6?'heavy':animation.damage>=3?'normal':'light'}`;
  const rarity = definition?.rarity ?? "NORMAL";

  return createPortal(
    <div
      aria-hidden="true"
      ref={phaseRef} data-attack-phase="ANTICIPATION" data-hitstop-ms={timeline.release-timeline.impact}
      className={`attack-animation attack-animation--cinematic ${impacted?'attack-animation--impacted':''} ${impactClass} attack-animation--rarity-${rarity.toLowerCase()} ${animation.target && animation.damage >= animation.target.currentHealth + 3 ? 'attack-animation--overkill' : ''} ${animation.finishingBlow ? "attack-animation--finisher" : ""}`}
      style={style}
    >
      {animation.finishingBlow && released && <div className="attack-animation__finisher"><div className="attack-animation__finisher-slash" /></div>}

      <div className="attack-animation__target" ref={targetRef}>
        {animation.targetKind === "CARD" && animation.target ? (
          <CardRenderer
            cardId={animation.target.definitionId}
            cosmeticOwnerId={(!animation.target.isToken || animation.target.isChampionToken) ? animation.targetPlayerId : undefined}
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
      <div className="attack-animation__attacker" ref={attackerRef}>

        <CardRenderer
          cardId={animation.attacker.definitionId}
          cosmeticOwnerId={(!animation.attacker.isToken || animation.attacker.isChampionToken) ? animation.attackerPlayerId : undefined}
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
      {impacted && animation.target && animation.damage>Math.max(0,animation.target.currentHealth) && <span className="ko-overkill-note" style={{left:contactX,top:contactY-40}}>초과 피해 포함</span>}
      {released && (animation.counterDamage??0)>0 && <span className="ko-counter-contact" style={{left:contactX,top:contactY+24}}>반격</span>}

    </div>, document.body
  );
}
