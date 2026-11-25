import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { prefersReducedMotion } from './presentation-config';
import { MOTION_EASING } from './presentation-policy';

/** Cosmetic Web Animations are optional, including implementations that exist but reject a property. */
function animatePresentation(element: HTMLElement | null | undefined, frames: Keyframe[], options: KeyframeAnimationOptions): Animation | undefined {
 try { return element?.animate?.(frames, options); }
 catch { return undefined; } // Never unmount a live battle because an optional browser animation is unsupported.
}

/** One finite owner for element reactions and competing shake requests. */
export function useBattleMotion() {
 const animations=useRef(new Map<HTMLElement,Animation>());
 const react=useCallback((element:HTMLElement|null|undefined,kind:'EFFECT'|'HIT'|'SILENCE'|'ZONE',strength=1)=>{
  if(!element||prefersReducedMotion()||!element.animate)return;
  animations.current.get(element)?.cancel();
  const amount=Math.min(3,Math.max(.5,strength));
  const frames:Keyframe[]=kind==='SILENCE'?[{filter:'saturate(1)'},{filter:'saturate(0)',offset:.4},{filter:'saturate(1)'}]
   :kind==='HIT'?[{translate:'0px 0px',rotate:'0deg'},{translate:amount+'px '+amount+'px',rotate:'1deg',offset:.3},{translate:-amount+'px 0px',rotate:'-1deg',offset:.6},{translate:'0px 0px',rotate:'0deg'}]
   :[{scale:'1'},{scale:kind==='ZONE'?'1.025':'1.035',offset:.35},{scale:'1'}];
  const animation=animatePresentation(element,frames,{duration:kind==='SILENCE'?240:180,easing:MOTION_EASING.recovery});
  if(!animation)return;
  animations.current.set(element,animation);
  animation.onfinish=()=>{if(animations.current.get(element)===animation)animations.current.delete(element);};
 },[]);
 useEffect(()=>()=>{for(const a of animations.current.values())a.cancel();animations.current.clear();},[]);
 return {react};
}

/** FLIP uses individual translate, preserving the selected card's own transform. */
export function useHandMotion(elements:RefObject<ReadonlyMap<string,HTMLElement>>,identity:string) {
 const previous=useRef(new Map<string,DOMRect>());
 const running=useRef<Animation[]>([]);
 const viewport=useRef('');
 useLayoutEffect(()=>{
  const interrupted=new Map<string,{left:number;top:number}>();
  for(const [id,element] of elements.current??[]){
   const before=previous.current.get(id);
   if(!before||!running.current.some(a=>a.playState==='running'&&(a.effect as KeyframeEffect)?.target===element))continue;
   const offset=getComputedStyle(element).translate.split(/\s+/).map(Number.parseFloat);
   interrupted.set(id,{left:before.left+(Number.isFinite(offset[0])?offset[0]:0),top:before.top+(Number.isFinite(offset[1])?offset[1]:0)});
  }
  for(const a of running.current)a.cancel();running.current=[];
  const next=new Map<string,DOMRect>();
  for(const [id,element] of elements.current??[])next.set(id,element.getBoundingClientRect());
  if(!prefersReducedMotion()&&(!viewport.current||viewport.current===`${window.innerWidth}x${window.innerHeight}`)) {
   for(const [id,element] of elements.current??[]) {
    if(element.closest('[data-dragging=true],[data-drag-returning=true],.ko-hand-card--selected')||element.querySelector('[data-dragging=true]'))continue;
    const before=interrupted.get(id)??previous.current.get(id),after=next.get(id)!;
    const dx=before?before.left-after.left:0,dy=before?before.top-after.top:0;
    if(before&&Math.hypot(dx,dy)>1) {
     const animation=animatePresentation(element,[{translate:dx+'px '+dy+'px'},{translate:'0px 0px'}],{duration:220,easing:MOTION_EASING.recovery});
     if(animation)running.current.push(animation);
    } else if(!before&&previous.current.size) {
     const animation=animatePresentation(element,[{opacity:.2,translate:'0px 7px',scale:'.985'},{opacity:1,translate:'0px 0px',scale:'1'}],{duration:210,easing:MOTION_EASING.ui});
     if(animation)running.current.push(animation);
    }
   }
  }
  viewport.current=`${window.innerWidth}x${window.innerHeight}`;previous.current=next;
 },[elements,identity]);
 useEffect(()=>{
  const stop=()=>{for(const a of running.current)a.cancel();running.current=[];};
  const scroll=(event:Event)=>{if(event.target instanceof Element&&event.target.closest('.ko-hand-cards')){stop();previous.current.clear();}};
  window.addEventListener('ko-combat-preferences',stop);window.addEventListener('scroll',scroll,true);
  return()=>{stop();window.removeEventListener('ko-combat-preferences',stop);window.removeEventListener('scroll',scroll,true);};
 },[]);
}

const colorblind=()=>typeof document!=='undefined'&&document.documentElement.dataset.koColorblind==='on';
export function MotionNumber({value,className='',format=(n:number)=>String(n),palette='stat'}:{value:number;className?:string;format?:(n:number)=>string|number;palette?:'stat'|'gold'}) {
 const previous=useRef(value);
 const element=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>{
  const previousValue=previous.current,changed=previousValue!==value;previous.current=value;
  if(!changed||prefersReducedMotion()||!Number.isFinite(value))return;
  const cb=colorblind();
  const animation=animatePresentation(element.current,
   palette==='gold'
    // Gold refills with a bright coin glint; spending just dips the number.
    ?value>previousValue
     ?[{scale:'1',textShadow:'0 0 0 transparent'},{scale:'1.55',color:'#ffe27a',textShadow:'0 0 10px #ffb52e,0 0 2px #3d2a06',offset:.25},{scale:'1',textShadow:'0 0 0 transparent'}]
     :[{scale:'1',opacity:1},{scale:'.82',opacity:.6,offset:.3},{scale:'1',opacity:1}]
   // Hearthstone-style: a buff swells green, a loss punches red and shakes.
   :value>previousValue
    ?[{scale:'1',translate:'0px 0px',textShadow:'0 0 0 transparent'},{scale:'1.65',translate:'0px -3px',color:cb?'#7cc4ff':'#8dff8a',textShadow:cb?'0 0 8px #2f8cff,0 0 2px #061a3d':'0 0 8px #3ddc5a,0 0 2px #0a3d14',offset:.22},{scale:'1.15',translate:'0px 0px',color:cb?'#7cc4ff':'#8dff8a',offset:.6},{scale:'1',translate:'0px 0px',textShadow:'0 0 0 transparent'}]
    :[{scale:'1',translate:'0px 0px',textShadow:'0 0 0 transparent'},{scale:'1.5',translate:'-2px 0px',color:cb?'#ffa23c':'#ff5a46',textShadow:cb?'0 0 8px #ff8a00,0 0 2px #3d1f00':'0 0 8px #ff2a1a,0 0 2px #3d0a0a',offset:.16},{scale:'1.3',translate:'2px 0px',color:cb?'#ffa23c':'#ff5a46',offset:.3},{scale:'1.12',translate:'-1px 0px',color:cb?'#ffb866':'#ff7a66',offset:.5},{scale:'1',translate:'0px 0px',textShadow:'0 0 0 transparent'}],
   {duration:palette==='gold'?480:560,easing:MOTION_EASING.recovery});
  if(palette==='gold'&&value>previousValue)try{element.current?.closest<HTMLElement>('[data-resource=gold]')?.animate([{boxShadow:'0 0 0 0 rgba(255,200,80,0)'},{boxShadow:'0 0 0 2px rgba(255,210,100,.9),0 0 18px 4px rgba(255,180,60,.6)',offset:.25},{boxShadow:'0 0 0 0 rgba(255,200,80,0)'}],{duration:700,easing:'ease-out'});}catch{}
  return()=>animation?.cancel();
 },[value]);
 // Always display authoritative health/resources; never invent intermediate combat values.
 return <span ref={element} style={{display:"inline-block"}} className={className} data-value={value} aria-label={String(format(value))}>{format(value)}</span>;
}
