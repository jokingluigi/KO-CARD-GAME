import {getCardDefinition,type GameState} from '@/game';
import type {PresentationCue} from './presentation-feedback';
import React,{createContext,useCallback,useContext,useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {audioManager} from '@/audio/audio-manager';
import {prefersReducedMotion} from './presentation-config';
import {cameraLevel,cinematicDuration,emptyCinematicState,finishCinematic,offerCinematic,type CinematicRequest,type CinematicEvent} from './cinematic-policy';
import './cinematic-presentation.css';
const noop=(_event:CinematicRequest)=>{};
const CinematicContext=createContext<(event:CinematicRequest)=>void>(noop);
export const useCinematic=()=>useContext(CinematicContext);
export const useCinematicAvailable=()=>useContext(CinematicContext)!==noop;
export function useCinematicEvent(event:CinematicRequest|null){
 const request=useCinematic();
 useEffect(()=>{if(event)request(event);},[request,event?.id]);
}
/** Reset by match key. No callback from this provider can advance or block a battle. */
export function CinematicProvider({children,speed='NORMAL'}:{children:ReactNode;speed?:'NORMAL'|'FAST'}){
 const [state,setState]=useState(emptyCinematicState);
 const container=useRef<HTMLDivElement>(null);
 const request=useCallback((event:CinematicRequest)=>{
  setState(s=>offerCinematic(s,{...event,createdAt:performance.now(),duration:cinematicDuration(event,prefersReducedMotion(),speed,s.pending.length)}));
 },[speed]);
 useEffect(()=>{
  const reset=()=>setState(emptyCinematicState());
  const hidden=()=>{if(document.hidden)reset();};
  window.addEventListener('resize',reset);document.addEventListener('visibilitychange',hidden);
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');media.addEventListener('change',reset);
  return()=>{window.removeEventListener('resize',reset);document.removeEventListener('visibilitychange',hidden);media.removeEventListener('change',reset);};
 },[]);
 const event=state.active;
 useEffect(()=>{
  if(!event)return;
  const motions:Animation[]=[];
  if(!prefersReducedMotion()){
   const level=cameraLevel(event),x=Math.max(-6,Math.min(6,((event.focus?.x??innerWidth/2)/innerWidth-.5)*level*3));
   const y=Math.max(-4,Math.min(4,((event.focus?.y??innerHeight/2)/innerHeight-.5)*level*2));
   const stage=container.current?.querySelector('.ko-game-stage');
   const background=container.current?.querySelector('.ko-cinematic-background');
   // Individual transform properties leave existing impact recoil transforms intact.
   for(const [node,depth] of [[stage,1],[background,.35]] as const){
    if(node instanceof HTMLElement&&typeof node.animate==='function'){
     try { motions.push(node.animate([{translate:'0px 0px',scale:'1'},{translate:`${x*depth}px ${y*depth}px`,scale:String(1+level*.003*depth),offset:.25},{translate:`${-x*.3*depth}px ${-y*.3*depth}px`,scale:String(1+level*.002*depth),offset:.55},{translate:'0px 0px',scale:'1'}],{duration:event.duration,easing:'cubic-bezier(.16,1,.3,1)'})); } catch { /* Unsupported animation APIs never stop a battle. */ }
    }
   }
  }
  if(cameraLevel(event)>=3)audioManager.duckForPresentation(event.kind==='FINISHER'?.4:.6,Math.min(650,event.duration));
  const finish=()=>setState(s=>finishCinematic(s,event.id,performance.now()));
  const fallback=window.setTimeout(finish,event.duration+80);
  return()=>{clearTimeout(fallback);motions.forEach(m=>m.cancel());};
 },[event?.id]);
 return <CinematicContext.Provider value={request}><div ref={container} style={{display:'contents'}}>{children}</div>
 {event&&createPortal(<CinematicScene key={event.id} event={event} />,document.body)}</CinematicContext.Provider>;
}
export function CinematicScene({event}:{event:CinematicEvent}){
 const major=!['ATTACK','SUMMON'].includes(event.kind),level=cameraLevel(event);
 const style={'--cinematic-duration':event.duration+'ms','--cinematic-x':(event.focus?.x??innerWidth/2)+'px','--cinematic-y':(event.focus?.y??innerHeight/2)+'px'} as CSSProperties;
 return <div aria-hidden="true" data-cinematic-kind={event.kind} data-camera-level={level} className={`ko-cinematic ko-cinematic--${event.kind.toLowerCase()} ${major?'ko-cinematic--major':''}`} style={style}>
 <div className="ko-cinematic__environment"/><div className="ko-cinematic__ink"/>
 {level>=2&&<div className="ko-cinematic__speed"/>}
 {major&&<div className="ko-cinematic__panel"><div className="ko-cinematic__emblem">KO</div>
 {event.art&&<img src={event.art} alt="" className="ko-cinematic__art" onError={e=>{e.currentTarget.style.visibility='hidden';}}/>}
 <div className="ko-cinematic__copy"><span>{event.subtitle??event.kind.replaceAll('_',' ')}</span><strong>{event.title}</strong></div></div>}
 {event.kind==='BIG_SPELL'&&<div className="ko-cinematic__spell-seal"/>}
 {event.kind==='HIDDEN_BOSS'&&<div className="ko-cinematic__interference"/>}
 </div>;
}

export function CinematicIntro({event}:{event:CinematicRequest}){useCinematicEvent(event);return null;}
export function CinematicCue({cue,state}:{cue:PresentationCue;state:GameState}){
 const owner=state.players.find(p=>p.id===cue.playerId||p.champion?.id===cue.championId);
 const champion=owner?.champion;
 const source=state.players.flatMap(p=>[...p.board,...p.hand,...p.graveyard,...p.removedFromGame]).find(c=>c?.instanceId===cue.sourceCardInstanceId);
 const definition=source&&(state.cardPool?.find(d=>d.id===source.definitionId)??getCardDefinition(source.definitionId));
 const kind=cue.kind==='EFFECT'&&cue.championId?'ABILITY':cue.kind==='DAMAGE'&&!cue.combat&&(cue.value??0)>=10?'FINISHER':null;
 useCinematicEvent(kind?{id:cue.id,kind,title:kind==='FINISHER'?definition?.name??'K.O. IMPACT':champion?.name??cue.label,subtitle:champion?.questCompleted?champion.upgradedAbility?.name??champion.ability.name:champion?.ability.name??'CHAMPION ABILITY',art:kind==='FINISHER'?definition?.imageUrl:champion?.questCompleted&&champion.questCompletedPortraitEnabled&&champion.questCompletedPortraitUrl?champion.questCompletedPortraitUrl:champion?.imageUrl,focus:{x:cue.left,y:cue.top}}:null);
 return null;
}
