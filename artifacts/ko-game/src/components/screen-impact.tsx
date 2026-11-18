import {createContext,useCallback,useContext,useEffect,useRef,useState,type RefObject} from 'react';
import {boardHop,boardHopFrames,effectiveImpact,combatCameraFrames,impactFrames,impactRank,parseShakeMode,SHAKE_STORAGE_KEY,type ScreenImpact,type ShakeMode} from './screen-impact-policy';
import {readCombatPreferences,impactMultiplier} from './combat-preferences';
import {prefersReducedMotion} from './presentation-config';
type ImpactApi={request:(impact:ScreenImpact)=>boolean;mode:ShakeMode;setMode:(mode:ShakeMode)=>void;isActive:()=>boolean};
const fallback:ImpactApi={request:()=>false,mode:'FULL',setMode:()=>{},isActive:()=>false};
export const ScreenImpactContext=createContext<ImpactApi>(fallback);
export const useScreenImpact=()=>useContext(ScreenImpactContext);
const readMode=()=>{try{return parseShakeMode(window.localStorage.getItem(SHAKE_STORAGE_KEY));}catch{return 'FULL' as const;}};
/** A single owner for global shake, nearby recoil and impact overlay. Never awaits gameplay. */
export function useScreenImpactManager(container:RefObject<HTMLDivElement|null>,cancelCamera:()=>void){
 const [mode,setPreference]=useState<ShakeMode>(readMode),modeRef=useRef(mode);
 const [impact,setImpact]=useState<ScreenImpact|null>(null);
 const current=useRef<{event:ScreenImpact;until:number}|null>(null),motions=useRef<Animation[]>([]);
 // Board hops outlive the camera shake, so they are tracked apart from it.
 const hops=useRef<Animation[]>([]);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),seen=useRef<string[]>([]);
 const clear=useCallback((update=true)=>{
  motions.current.forEach(a=>a.cancel());motions.current=[];current.current=null;
  if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}
  const stage=container.current?.querySelector<HTMLElement>('.ko-game-stage');
  if(stage){delete stage.dataset.screenImpactTier;delete stage.dataset.screenImpactAmplitude;delete stage.dataset.screenImpactStarted;}
  if(update)setImpact(null);
 },[container]);
 const setMode=useCallback((value:ShakeMode)=>{
  modeRef.current=value;setPreference(value);clear();cancelCamera();
  try{window.localStorage.setItem(SHAKE_STORAGE_KEY,value);}catch{/* Optional preference storage. */}
 },[clear,cancelCamera]);
 const request=useCallback((event:ScreenImpact)=>{
  if(event.profile.tier==='NONE'||document.hidden||seen.current.includes(event.id))return false;
  seen.current=[...seen.current,event.id].slice(-96);
  const active=current.current;
  if(active&&performance.now()<active.until&&(impactRank(active.event.profile)>impactRank(event.profile)||(impactRank(active.event.profile)===impactRank(event.profile)&&active.event.profile.amplitude>event.profile.amplitude)))return false;
  clear();
  const reduced=prefersReducedMotion(),multiplier=impactMultiplier(readCombatPreferences().intensity),profile=effectiveImpact({...event.profile,amplitude:event.profile.amplitude*multiplier,wave:event.profile.wave*multiplier},{width:innerWidth,height:innerHeight},modeRef.current,reduced);
  current.current={event,until:performance.now()+profile.duration};
  const stage=container.current?.querySelector<HTMLElement>('.ko-game-stage'),background=container.current?.querySelector<HTMLElement>('.ko-cinematic-background');
  const animate=(node:HTMLElement|null|undefined,frames:Keyframe[],duration:number)=>{
   if(!node?.animate)return;try{motions.current.push(node.animate(frames,{duration,easing:'linear'}));}catch{/* Always fall back to the finite overlay. */}
  };
  if(stage){stage.dataset.screenImpactTier=profile.tier;stage.dataset.screenImpactAmplitude=String(profile.amplitude);stage.dataset.screenImpactStarted=String(performance.now());}
  const zoom=reduced?0:readCombatPreferences().zoom;
  if(profile.amplitude>0||zoom>0){
   cancelCamera();
   const cameraNodes=[stage,...Array.from(document.querySelectorAll<HTMLElement>('.attack-animation,.ko-contact-camera'))].filter((node):node is HTMLElement=>Boolean(node));
   for(const node of cameraNodes){
    const rect=node.getBoundingClientRect();
    const frames=combatCameraFrames(profile,event.direction,modeRef.current==='REDUCED',zoom).map(frame=>({...frame,transformOrigin:`${event.x-rect.left}px ${event.y-rect.top}px`}));
    animate(node,frames,profile.duration);
   }
   animate(background,impactFrames({...profile,amplitude:profile.amplitude*.3,rotation:profile.rotation*.25},event.direction,event.radial),profile.duration);
   if(event.nearby&&profile.amplitude>0){
    // Heavy landings make every other card on the board hop and drop back, rolling outward.
    const cards=container.current?.querySelectorAll<HTMLElement>('.ko-board-slot-wrapper [data-rarity]')??[];
    const scale=modeRef.current==='REDUCED'?.5:1;
    hops.current.forEach(a=>a.cancel());hops.current=[];
    for(const card of Array.from(cards).slice(0,14)){
     const rect=card.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,distance=Math.hypot(cx-event.x,cy-event.y);
     if(!rect.width||distance<Math.max(rect.width,rect.height)*.5)continue;
     const hop=boardHop(event.profile,distance);
     if(hop.height<=0)continue;
     try{hops.current.push(card.animate(boardHopFrames(hop.height*scale,cx<event.x?-1:1),{duration:520,delay:hop.delay,fill:'backwards'}));}catch{/* Visual only. */}
    }
   }
  }
  setImpact({...event,profile});
  timer.current=setTimeout(()=>clear(),profile.duration+40);
  return true;
 },[clear,container,cancelCamera]);
 useEffect(()=>{
  const reset=()=>clear(),hidden=()=>{if(document.hidden)clear();};
  const stored=(e:StorageEvent)=>{if(e.key===SHAKE_STORAGE_KEY){modeRef.current=parseShakeMode(e.newValue);setPreference(modeRef.current);clear();}};
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  window.addEventListener('ko-combat-preferences',reset);window.addEventListener('resize',reset);window.addEventListener('storage',stored);document.addEventListener('visibilitychange',hidden);media.addEventListener('change',reset);
  return()=>{clear(false);hops.current.forEach(a=>a.cancel());hops.current=[];window.removeEventListener('ko-combat-preferences',reset);window.removeEventListener('resize',reset);window.removeEventListener('storage',stored);document.removeEventListener('visibilitychange',hidden);media.removeEventListener('change',reset);};
 },[clear]);
 const isActive=useCallback(()=>Boolean(current.current&&performance.now()<current.current.until),[]);
 return {api:{request,mode,setMode,isActive},impact,clear};
}
export function ScreenShakeSetting(){
 const {mode,setMode}=useScreenImpact();
 return <label className="flex min-h-10 items-center justify-between gap-3 text-xs font-bold text-neutral-300"><span>화면 흔들림</span><select aria-label="화면 흔들림" className="rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-white" value={mode} onChange={e=>setMode(parseShakeMode(e.target.value))}><option value="FULL">Full · 강하게</option><option value="REDUCED">Reduced · 약하게</option><option value="OFF">Off · 끄기</option></select></label>;
}
