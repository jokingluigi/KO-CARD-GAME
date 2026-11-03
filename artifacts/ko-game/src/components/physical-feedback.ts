import {useLayoutEffect,useEffect,useRef,type RefObject} from 'react';
import {prefersReducedMotion} from './presentation-config';
const flights=new Set<()=>void>();
export function clearInterfaceFlights(){for(const stop of [...flights])stop();}
export function flyBetween(from:Element|null|undefined,to:Element|null|undefined,reverse=false) {
 if(!from||!to||prefersReducedMotion())return;
 const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();if(!a.width||!b.width)return;
 const ghost=from.cloneNode(true) as HTMLElement;ghost.removeAttribute('id');ghost.removeAttribute('data-testid');ghost.querySelectorAll('[id],[data-testid]').forEach(n=>{n.removeAttribute('id');n.removeAttribute('data-testid');});ghost.inert=true;ghost.dataset.uiFlight='true';ghost.setAttribute('aria-hidden','true');
 Object.assign(ghost.style,{position:'fixed',left:`${a.left}px`,top:`${a.top}px`,width:`${a.width}px`,height:`${a.height}px`,zIndex:'290',margin:'0',pointerEvents:'none',transformOrigin:'center',overflow:'hidden'});
 document.body.appendChild(ghost);
 let animation:Animation|undefined;const stop=()=>{clearTimeout(expiry);animation?.cancel();ghost.remove();flights.delete(stop);};
 const expiry=setTimeout(stop,400);flights.add(stop);
 try{animation=ghost.animate([{translate:'0px 0px',scale:'1',opacity:.8},{translate:`${b.left+b.width/2-a.left-a.width/2}px ${b.top+b.height/2-a.top-a.height/2}px`,scale:reverse?'0.65':'0.2',opacity:0}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'});animation.finished.catch(()=>{}).finally(stop);}catch{stop();}
 return stop;
}
/** Keyed FLIP keeps retained search results in place instead of replaying entrances. */
export function useGridReflow(root:RefObject<HTMLElement|null>,signature:unknown){
 const previous=useRef(new Map<string,DOMRect>()),motions=useRef(new Map<HTMLElement,Animation>()),viewport=useRef('');
 useLayoutEffect(()=>{
  const visual=new Map<string,{x:number;y:number}>();
  root.current?.querySelectorAll<HTMLElement>('[data-motion-key]').forEach(n=>{
   const old=previous.current.get(n.dataset.motionKey!);
   if(!old)return;
   const offset=motions.current.has(n)?getComputedStyle(n).translate.split(/\s+/).map(Number.parseFloat):[0,0];
   visual.set(n.dataset.motionKey!,{x:old.x+(Number.isFinite(offset[0])?offset[0]:0),y:old.y+(Number.isFinite(offset[1])?offset[1]:0)});
  });
  motions.current.forEach(a=>a.cancel());motions.current.clear();
  const next=new Map<string,DOMRect>(),size=`${innerWidth}x${innerHeight}`;
  root.current?.querySelectorAll<HTMLElement>('[data-motion-key]').forEach(n=>{
   const id=n.dataset.motionKey!,r=n.getBoundingClientRect(),old=visual.get(id);next.set(id,new DOMRect(r.x+scrollX,r.y+scrollY,r.width,r.height));
   if(prefersReducedMotion()||!r.width||!r.height||r.bottom<0||r.top>innerHeight||(viewport.current&&viewport.current!==size))return;
   const dx=old?old.x-r.x-scrollX:0,dy=old?old.y-r.y-scrollY:0;
   const moved=old&&Math.hypot(dx,dy)>1;
   if(!moved&&(!previous.current.size||old))return;
   const local=moved&&Math.abs(dx)<innerWidth*.7&&Math.abs(dy)<innerHeight*.7;
   try{
    const animation=n.animate(local?[{translate:`${dx}px ${dy}px`},{translate:'0px 0px'}]:[{opacity:.35,translate:'0px 5px'},{opacity:1,translate:'0px 0px'}],{duration:local?240:160,easing:'cubic-bezier(.2,.8,.2,1)'});
    motions.current.set(n,animation);
    animation.finished.catch(()=>{}).finally(()=>{if(motions.current.get(n)===animation)motions.current.delete(n);});
   }catch{}
  });previous.current=next;viewport.current=size;
 },[signature,root]);
 useEffect(()=>{
  const stop=()=>{motions.current.forEach(a=>a.cancel());motions.current.clear();};
  const hidden=()=>{if(document.hidden)stop();};
  window.addEventListener('ko-combat-preferences',stop);document.addEventListener('visibilitychange',hidden);
  return()=>{stop();window.removeEventListener('ko-combat-preferences',stop);document.removeEventListener('visibilitychange',hidden);};
 },[]);
}

let origin:{node:HTMLElement;rect:DOMRect;at:number}|undefined;
let originExpiry:ReturnType<typeof setTimeout>|undefined;
export function rememberCardOrigin(node:HTMLElement){if(originExpiry)clearTimeout(originExpiry);origin={node,rect:node.getBoundingClientRect(),at:performance.now()};originExpiry=setTimeout(()=>{origin=undefined;},1500);}
export function useDetailFlight(root:RefObject<HTMLElement|null>,open:boolean,id?:string){
 useLayoutEffect(()=>{
  if(!open||!origin||performance.now()-origin.at>1200||prefersReducedMotion())return;
  const from=origin;let node:HTMLElement|null=null,animation:Animation|undefined,frame=0,attempts=0;
  const start=()=>{
   node=root.current?.querySelector<HTMLElement>('.ko-card-depth')??null;
   if(!node){if(attempts++<5)frame=requestAnimationFrame(start);return;}
   const r=node.getBoundingClientRect();
   try{animation=node.animate([{translate:`${from.rect.x-r.x}px ${from.rect.y-r.y}px`,scale:String(Math.min(1,from.rect.width/r.width)),opacity:.65},{translate:'0px 0px',scale:'1',opacity:1}],{duration:200,easing:'ease-out'});}catch{}
  };
  start();
  return()=>{cancelAnimationFrame(frame);animation?.cancel();if(node&&from.node.isConnected)flyBetween(node,from.node);};
 },[open,id,root]);
}

/** Reorientation uses the same retained catalog node, never resets filters or scroll. */
export function returnToCatalogCard(node:HTMLElement|null) {
 if(!node?.isConnected)return;
 node.focus({preventScroll:true});
 const rect=node.getBoundingClientRect();
 if(rect.top<0||rect.bottom>window.innerHeight)node.scrollIntoView({block:'nearest',behavior:'instant'});
 try{node.animate([{outline:'2px solid #e8c777',outlineOffset:'3px'},{outline:'2px solid transparent',outlineOffset:'3px'}],{duration:prefersReducedMotion()?180:650});}catch{}
}
