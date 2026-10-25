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
 const viewport=useRef(0);
 useLayoutEffect(()=>{
  for(const a of running.current)a.cancel();running.current=[];
  const next=new Map<string,DOMRect>();
  for(const [id,element] of elements.current??[])next.set(id,element.getBoundingClientRect());
  if(!prefersReducedMotion()&&(!viewport.current||viewport.current===window.innerWidth)) {
   for(const [id,element] of elements.current??[]) {
    const before=previous.current.get(id),after=next.get(id)!;
    const dx=before?before.left-after.left:0,dy=before?before.top-after.top:0;
    if(before&&Math.hypot(dx,dy)>1) {
     const animation=animatePresentation(element,[{translate:dx+'px '+dy+'px'},{translate:'0px 0px'}],{duration:220,easing:MOTION_EASING.recovery});
     if(animation)running.current.push(animation);
    } else if(!before&&previous.current.size) {
     const animation=animatePresentation(element,[{opacity:0},{opacity:1}],{duration:180,easing:MOTION_EASING.ui});
     if(animation)running.current.push(animation);
    }
   }
  }
  viewport.current=window.innerWidth;previous.current=next;
 },[elements,identity]);
 useEffect(()=>()=>{for(const a of running.current)a.cancel();},[]);
}

export function MotionNumber({value,className='',format=(n:number)=>String(n)}:{value:number;className?:string;format?:(n:number)=>string|number}) {
 const previous=useRef(value);
 const element=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>{
  const changed=previous.current!==value;previous.current=value;
  if(!changed||prefersReducedMotion()||!Number.isFinite(value))return;
  const animation=animatePresentation(element.current,
   [{scale:'1'},{scale:'1.08',offset:.3},{scale:'1'}],
   {duration:180,easing:MOTION_EASING.recovery});
  return()=>animation?.cancel();
 },[value]);
 // Always display authoritative health/resources; never invent intermediate combat values.
 return <span ref={element} className={className} data-value={value} aria-label={String(format(value))}>{format(value)}</span>;
}
