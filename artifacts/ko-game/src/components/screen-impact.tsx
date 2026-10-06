import {createContext,useCallback,useContext,useEffect,useRef,useState,type CSSProperties,type RefObject} from 'react';
import {effectiveImpact,impactFrames,impactRank,parseShakeMode,SHAKE_STORAGE_KEY,type ScreenImpact,type ShakeMode} from './screen-impact-policy';
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
  const reduced=prefersReducedMotion(),profile=effectiveImpact(event.profile,{width:innerWidth,height:innerHeight},modeRef.current,reduced);
  current.current={event,until:performance.now()+profile.duration};
  const stage=container.current?.querySelector<HTMLElement>('.ko-game-stage'),background=container.current?.querySelector<HTMLElement>('.ko-cinematic-background');
  const animate=(node:HTMLElement|null|undefined,frames:Keyframe[],duration:number)=>{
   if(!node?.animate)return;try{motions.current.push(node.animate(frames,{duration,easing:'linear'}));}catch{/* Always fall back to the finite overlay. */}
  };
  if(stage){stage.dataset.screenImpactTier=profile.tier;stage.dataset.screenImpactAmplitude=String(profile.amplitude);stage.dataset.screenImpactStarted=String(performance.now());}
  if(profile.amplitude>0){
   cancelCamera();
   animate(stage,impactFrames(profile,event.direction,event.radial),profile.duration);
   animate(background,impactFrames({...profile,amplitude:profile.amplitude*.3,rotation:profile.rotation*.25},event.direction,event.radial),profile.duration);
   if(event.nearby){
    const cards=container.current?.querySelectorAll<HTMLElement>('.ko-board-slot-wrapper [data-rarity]')??[];
    for(const card of Array.from(cards).slice(0,12)){
     const rect=card.getBoundingClientRect(),dx=rect.left+rect.width/2-event.x,dy=rect.top+rect.height/2-event.y,distance=Math.hypot(dx,dy);
     if(distance<Math.max(rect.width,rect.height)*.5)continue;
     const near=distance<220,amount=(near?Math.min(6,profile.amplitude*.4):Math.min(3,profile.amplitude*.18));
     const direction=dx<0?-1:1;
     animate(card,[{translate:'0px 0px',rotate:'0deg'},{translate:`${direction*amount}px ${amount*.4}px`,rotate:`${direction*(near?3:1)*(modeRef.current==='REDUCED'?.5:1)}deg`,offset:.22},{translate:`${-direction*amount*.35}px 0px`,rotate:`${-direction*.6}deg`,offset:.55},{translate:'0px 0px',rotate:'0deg'}],Math.min(280,profile.duration));
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
  window.addEventListener('resize',reset);window.addEventListener('storage',stored);document.addEventListener('visibilitychange',hidden);media.addEventListener('change',reset);
  return()=>{clear(false);window.removeEventListener('resize',reset);window.removeEventListener('storage',stored);document.removeEventListener('visibilitychange',hidden);media.removeEventListener('change',reset);};
 },[clear]);
 const isActive=useCallback(()=>Boolean(current.current&&performance.now()<current.current.until),[]);
 return {api:{request,mode,setMode,isActive},impact};
}
export function ScreenShakeSetting(){
 const {mode,setMode}=useScreenImpact();
 return <label className="flex min-h-10 items-center justify-between gap-3 text-xs font-bold text-neutral-300"><span>화면 흔들림</span><select aria-label="화면 흔들림" className="rounded border border-neutral-700 bg-neutral-900 px-2 py-2 text-white" value={mode} onChange={e=>setMode(parseShakeMode(e.target.value))}><option value="FULL">Full · 강하게</option><option value="REDUCED">Reduced · 약하게</option><option value="OFF">Off · 끄기</option></select></label>;
}
export function ScreenImpactScene({impact}:{impact:ScreenImpact}){
 const {profile}=impact,heavy=impactRank(profile)>=3;
 const style={'--impact-x':impact.x+'px','--impact-y':impact.y+'px','--impact-duration':profile.duration+'ms','--impact-wave':Math.min(900,Math.max(90,profile.wave*90))+'px','--impact-accent':profile.rarity==='CHAMPION'?'#cc5746':profile.rarity==='LEGENDARY'?'#f4c97d':profile.rarity==='EPIC'?'#b0a0d5':'#d9b78c'} as CSSProperties;
 return <div className={`ko-screen-impact ko-screen-impact--${profile.rarity.toLowerCase()} ${heavy?'ko-screen-impact--heavy':''}`} data-screen-impact={profile.tier} data-shake-mode={profile.amplitude===0?'OFF':'ON'} aria-hidden="true" style={style}>
 <div className="ko-screen-impact__wave"/>
 {profile.aftershock&&<div className="ko-screen-impact__wave ko-screen-impact__wave--after"/>}
 {heavy&&<><div className="ko-screen-impact__ink"/>{Array.from({length:8},(_,i)=><i key={i} className="ko-screen-impact__debris" style={{'--debris-x':Math.cos(i*Math.PI/4)*(i%2?65:115)+'px','--debris-y':Math.sin(i*Math.PI/4)*55-35+'px','--debris-rotation':(i*37)+'deg'} as CSSProperties}/>)}</>}
 {impactRank(profile)>=4&&<div className="ko-screen-impact__edge"/>}
 </div>;
}
