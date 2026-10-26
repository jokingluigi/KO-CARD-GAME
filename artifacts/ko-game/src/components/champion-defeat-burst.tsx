import {useLayoutEffect,useRef,type RefObject,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {audioManager} from '../audio/audio-manager';
import {prefersReducedMotion} from './presentation-config';
import './champion-defeat-burst.css';

/** Fragments are clipped from the actual equipped HUD image, never an enlarged duplicate scene. */
export function ChampionDefeatBurst({anchor,id,onComplete,onBurst}:{anchor:RefObject<HTMLDivElement|null>;id:string;onComplete:()=>void;onBurst?:()=>void}) {
 const root=useRef<HTMLDivElement>(null),complete=useRef(onComplete),fracture=useRef(onBurst);complete.current=onComplete;fracture.current=onBurst;
 useLayoutEffect(()=>{
  const target=anchor.current,container=root.current;
  if(!target||!container){complete.current();return;}
  const reduced=prefersReducedMotion(),burstAt=reduced?80:180,duration=reduced?350:1580;
  const previousVisibility=target.style.visibility;
  const rect=target.getBoundingClientRect();
  container.style.left=rect.left+'px';container.style.top=rect.top+'px';container.style.width=rect.width+'px';container.style.height=rect.height+'px';
  const image=target.querySelector<HTMLImageElement>('.ko-champion-portrait-art img')??target.querySelector<HTMLImageElement>('img');
  const src=image?.currentSrc||image?.src;
  const fragments=Array.from(container.querySelectorAll<HTMLElement>('.ko-hud-shard'));
  for(const fragment of fragments) {
   if(src)fragment.style.backgroundImage=`url(${JSON.stringify(src)})`;
  }
  container.dataset.phase='crack';
  const motions:Animation[]=[];
  const burst=window.setTimeout(()=>{
   target.style.visibility='hidden';container.dataset.phase='burst';fracture.current?.();
   if(!document.hidden) audioManager.playImpactOverlay(import.meta.env.BASE_URL+'sfx/champion-glass-shatter.wav',85,9);
   for(const [i,fragment] of fragments.entries()){
    const column=Math.floor(i/2)%4,row=Math.floor(i/8),angle=Math.atan2(row-2+(i%2?.3:-.3),column-1.5)+((i*17)%9-4)*.06;
    const distance=(reduced?0:95+(i*47)%170),dx=Math.cos(angle)*distance,dy=Math.sin(angle)*distance;
    try{motions.push(fragment.animate([
     {transform:'translate3d(0,0,0) rotate(0deg)',opacity:1,offset:0},
     {transform:`translate3d(${dx*.32}px,${dy*.32}px,0) rotate(${reduced?0:(i%2?1:-1)*18}deg)`,opacity:1,offset:.18},
     {transform:`translate3d(${dx}px,${dy+(reduced?0:65)}px,0) rotate(${reduced?0:(i%2?1:-1)*(65+i%5*17)}deg)`,opacity:0,offset:1},
    ],{duration:duration-burstAt,easing:'cubic-bezier(.12,.6,.3,1)',fill:'forwards'}));}catch{fragment.style.opacity='0';}
   }
  },burstAt);
  const finish=window.setTimeout(()=>{container.dataset.phase='done';complete.current();},duration);
  return()=>{clearTimeout(burst);clearTimeout(finish);motions.forEach(m=>m.cancel());target.style.visibility=previousVisibility;};
 },[id,anchor]);
 // Forty triangular pieces tile the original portrait without duplicating its position or scale.
 const shards=Array.from({length:40},(_,i)=>{
  const c=Math.floor(i/2)%4,r=Math.floor(i/8),x=c*25,y=r*20;
  const points=i%2?`${x}% ${y}%,${x+25}% ${y+20}%,${x}% ${y+20}%`:`${x}% ${y}%,${x+25}% ${y}%,${x+25}% ${y+20}%`;
  return <i className="ko-hud-shard" key={i} style={{clipPath:`polygon(${points})`} as CSSProperties}/>;
 });
 return createPortal(<div ref={root} className="ko-hud-defeat" data-testid="champion-hud-shatter" aria-hidden="true">
  <svg className="ko-hud-defeat__cracks" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M50 47L12 0M50 47L77 0M50 47L100 29M50 47L100 84M50 47L71 100M50 47L18 100M50 47L0 67M50 47L0 21M27 20L18 32L0 35M76 39L81 62L100 66M36 68L17 65L10 83M61 71L76 76L85 100"/></svg>
  {shards}
 </div>,document.body);
}
