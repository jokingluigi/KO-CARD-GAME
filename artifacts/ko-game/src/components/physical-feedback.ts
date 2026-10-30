import {useLayoutEffect,useEffect,useRef,type RefObject} from 'react';
import {prefersReducedMotion} from './presentation-config';
export function flyBetween(from:Element|null|undefined,to:Element|null|undefined,reverse=false) {
 if(!from||!to||prefersReducedMotion())return;
 const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();if(!a.width||!b.width)return;
 const ghost=from.cloneNode(true) as HTMLElement;ghost.removeAttribute('id');ghost.removeAttribute('data-testid');ghost.querySelectorAll('[id],[data-testid]').forEach(n=>{n.removeAttribute('id');n.removeAttribute('data-testid');});ghost.inert=true;ghost.setAttribute('aria-hidden','true');
 Object.assign(ghost.style,{position:'fixed',left:`${a.left}px`,top:`${a.top}px`,width:`${a.width}px`,height:`${a.height}px`,zIndex:'290',margin:'0',pointerEvents:'none',transformOrigin:'center',overflow:'hidden'});
 document.body.appendChild(ghost);
 const expiry=setTimeout(()=>ghost.remove(),400);
 try{const animation=ghost.animate([{translate:'0px 0px',scale:'1',opacity:.8},{translate:`${b.left+b.width/2-a.left-a.width/2}px ${b.top+b.height/2-a.top-a.height/2}px`,scale:reverse?'0.65':'0.2',opacity:0}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'});animation.finished.catch(()=>{}).finally(()=>{clearTimeout(expiry);ghost.remove();});}catch{clearTimeout(expiry);ghost.remove();}
}
/** Keyed FLIP keeps retained search results in place instead of replaying entrances. */
export function useGridReflow(root:RefObject<HTMLElement|null>,signature:unknown){
 const previous=useRef(new Map<string,DOMRect>()),motions=useRef<Animation[]>([]);
 useLayoutEffect(()=>{
  motions.current.forEach(a=>a.cancel());motions.current=[];
  const next=new Map<string,DOMRect>();
  root.current?.querySelectorAll<HTMLElement>('[data-motion-key]').forEach(n=>{
   const id=n.dataset.motionKey!,r=n.getBoundingClientRect(),old=previous.current.get(id);next.set(id,r);
   if(old&&!prefersReducedMotion()&&Math.hypot(old.x-r.x,old.y-r.y)>1)try{motions.current.push(n.animate([{translate:`${old.x-r.x}px ${old.y-r.y}px`},{translate:'0px 0px'}],{duration:180,easing:'ease-out'}));}catch{}
  });previous.current=next;
 },[signature,root]);
 useEffect(()=>()=>motions.current.forEach(a=>a.cancel()),[]);
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
