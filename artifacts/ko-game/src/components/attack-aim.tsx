import {useEffect,useRef,type RefObject} from 'react';
import {createPortal} from 'react-dom';
type Props={source:HTMLElement|null;targets:RefObject<Map<string,HTMLDivElement>>;champion:HTMLElement|null;championId:string;valid:Set<string>;selectedId:string|null;enabled:boolean;targetsFor:(id:string)=>Set<string>;select:(id:string)=>void;commit:(id:string)=>void;preview:(attacker:string,target:string)=>number|null};
export function AttackAim(props:Props){
 const latest=useRef(props);latest.current=props;const line=useRef<SVGLineElement>(null),lock=useRef<SVGEllipseElement>(null),number=useRef<SVGTextElement>(null);
 useEffect(()=>{
  let gesture:{id:string;pointer:number;node:HTMLElement;x:number;y:number;started:boolean}|null=null,suppress=false,frame=0;
  const hide=()=>{if(line.current)line.current.style.opacity='0';if(lock.current)lock.current.style.opacity='0';if(number.current)number.current.style.opacity='0';};
  const reset=()=>{gesture=null;hide();cancelAnimationFrame(frame);};
  const targetAt=(x:number,y:number,valid:Set<string>)=>[...latest.current.targets.current.entries(),[latest.current.championId,latest.current.champion] as const].find(([id,node])=>{if(!node||!valid.has(id))return false;const r=node.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;});
  const down=(e:PointerEvent)=>{
   suppress=false;if(!latest.current.enabled||e.button!==0||!e.isPrimary||(e.target as Element).closest('button,[data-touch-inspect-trigger],a'))return;
   const entry=[...latest.current.targets.current.entries()].find(([id,node])=>node.contains(e.target as Node)&&latest.current.targetsFor(id).size>0);
   if(entry)gesture={id:entry[0],pointer:e.pointerId,node:entry[1],x:e.clientX,y:e.clientY,started:false};
  };
  const move=(e:PointerEvent)=>{
   const p=latest.current,g=gesture;
   if(g&&g.pointer===e.pointerId&&!g.started&&Math.hypot(e.clientX-g.x,e.clientY-g.y)>9){g.started=true;window.dispatchEvent(new Event("ko-pointer-drag-start"));if(p.selectedId!==g.id)p.select(g.id);}
   if(g?.started){e.preventDefault();e.stopPropagation();}
   const source=g?.started?g.node:p.source,valid=g?.started?p.targetsFor(g.id):p.valid;
   const target=source&&targetAt(e.clientX,e.clientY,valid);if(!source||!target||!line.current||!lock.current){hide();return;}
   const s=source.getBoundingClientRect(),t=target[1]!.getBoundingClientRect();
   for(const [k,v] of Object.entries({x1:s.left+s.width/2,y1:s.top+s.height*.3,x2:t.left+t.width/2,y2:t.top+t.height*.5}))line.current.setAttribute(k,String(v));
   for(const [k,v] of Object.entries({cx:t.left+t.width/2,cy:t.top+t.height*.5,rx:t.width*.42,ry:Math.min(t.width*.42,t.height*.3)}))lock.current.setAttribute(k,String(v));
   line.current.style.opacity='1';lock.current.style.opacity='1';
   if(number.current)number.current.style.opacity='0';const amount=p.preview(g?.started?g.id:p.selectedId??'',target[0]);if(number.current&&amount!==null){number.current.setAttribute('x',String(t.left+t.width/2));number.current.setAttribute('y',String(Math.max(18,t.top-8)));number.current.textContent='~'+amount;number.current.style.opacity='1';}

  };
  const up=(e:PointerEvent)=>{
   const g=gesture;if(!g||g.pointer!==e.pointerId)return;
   if(!g.started){reset();return;}
   e.preventDefault();e.stopPropagation();const target=targetAt(e.clientX,e.clientY,latest.current.targetsFor(g.id));suppress=true;gesture=null;hide();
   // Give the existing selection callback one paint to commit before its target callback.
   if(target)frame=requestAnimationFrame(()=>{if(latest.current.enabled&&latest.current.targetsFor(g.id).has(target[0]))latest.current.commit(target[0]);});
  };
  const click=(e:MouseEvent)=>{if(suppress&&e.detail!==0){suppress=false;e.preventDefault();e.stopImmediatePropagation();}};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')reset();};
  const hidden=()=>{if(document.hidden)reset();};
  document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move,{capture:true,passive:false});document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',reset,true);document.addEventListener('click',click,true);document.addEventListener('keydown',key);document.addEventListener('visibilitychange',hidden);window.addEventListener('resize',reset);window.addEventListener('ko-card-inspect-hold',reset);window.addEventListener('ko-gamepad-cancel',reset);
  return()=>{reset();document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',reset,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('resize',reset);window.removeEventListener('ko-card-inspect-hold',reset);window.removeEventListener('ko-gamepad-cancel',reset);};
 },[]);
 return createPortal(<svg aria-hidden="true" className="ko-attack-aim"><defs><marker id="ko-aim-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#e8c367"/></marker></defs><line ref={line} markerEnd="url(#ko-aim-arrow)" stroke="#e8c367" strokeWidth="3" style={{opacity:0}}/><ellipse ref={lock} fill="none" stroke="#e8c367" strokeWidth="2" style={{opacity:0}}/><text ref={number} className="ko-attack-aim__estimate" textAnchor="middle" fill="#ffe6a0" style={{opacity:0}}> </text></svg>,document.body);
}
