import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {getCardDefinition,type GameState} from '@/game';
import {zoneVisualPlans,arrivalStatParts,effectWavePlans} from './battle-zone-visual-policy';
import {CardLeaveAnimation,type CardLeaveAnimationState} from './card-leave-animation';
import {prefersReducedMotion} from './presentation-config';
import './effect-readability.css';
type Refs={hand:RefObject<Map<string,HTMLDivElement>>;board:RefObject<Map<string,HTMLDivElement>>};
/** A bounded decorative channel. It never joins the action/presentation busy gate. */
export function BattleZoneVisuals({state,hand,board,introActive}:{state:GameState;introActive:boolean}&Refs){
 const host=useRef<HTMLSpanElement>(null),previous=useRef(state),positions=useRef(new Map<string,DOMRect>()),motions=useRef<Animation[]>([]);
 const ready=state.status==='IN_PROGRESS'&&!introActive&&!state.openingMulligan;
 const waveTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const [waves,setWaves]=useState<Array<{id:string;from:{x:number;y:number};targets:{x:number;y:number}[]}>>([]);
 const wasReady=useRef(ready),[flights,setFlights]=useState<CardLeaveAnimationState[]>([]);
 useEffect(()=>{
  const before=previous.current;previous.current=state;
  const root=host.current?.closest('.ko-game-stage'),old=positions.current;
  const current=new Map<string,DOMRect>();for(const [id,n]of [...board.current,...hand.current])current.set(id,n.getBoundingClientRect());positions.current=current;
  const reset=before.gameId!==state.gameId||before.events.length>state.events.length;
  motions.current.forEach(a=>a.cancel());motions.current=[];
  const animate=(n:Element|null|undefined,frames:Keyframe[],duration=260)=>{if(!n||prefersReducedMotion())return;try{motions.current.push(n.animate(frames,{duration,easing:'ease-out'}));}catch{}};
  const entering=ready&&!wasReady.current&&!reset;wasReady.current=ready;
  if(reset||!ready){setFlights([]);setWaves([]);if(waveTimer.current)clearTimeout(waveTimer.current);return;}
  if(entering){root?.querySelectorAll('.ko-hand-cards img,.ko-board-cards img,.ko-portrait-window img').forEach(n=>animate(n,[{opacity:.65,filter:'brightness(1.12)'},{opacity:1,filter:'brightness(1)'}],240));}
  const at=(r:DOMRect)=>({x:r.x+r.width/2,y:r.y+r.height/2});
  const incoming=effectWavePlans(before,state,getCardDefinition).flatMap(plan=>{
    const source=current.get(plan.sourceId)??old.get(plan.sourceId)??(plan.sourcePlayerId?root?.querySelector(plan.sourcePlayerId===state.players[0].id?'.ko-player-champion .ko-portrait-window':'.ko-opponent-champion .ko-portrait-window')?.getBoundingClientRect():undefined);if(!source)return [];
    const targets=plan.targets.flatMap(t=>{const r=t.cardId?current.get(t.cardId)??old.get(t.cardId):root?.querySelector(t.playerId===state.players[0].id?'.ko-player-champion':'.ko-opponent-champion')?.getBoundingClientRect();return r?[at(r)]:[];});
    return targets.length>1?[{id:plan.id,from:at(source),targets:targets.slice(0,8)}]:[];
  });
  if(incoming.length){if(waveTimer.current)clearTimeout(waveTimer.current);setWaves(incoming.slice(-2));waveTimer.current=setTimeout(()=>setWaves([]),800);}
  const next:CardLeaveAnimationState[]=[];
  for(const p of zoneVisualPlans(before,state,state.players[0].id)){
   const self=p.playerId===state.players[0].id,side=self?'player':'opponent';
   const destination=p.kind==='RETURN_DECK'?root?.querySelector(`.ko-${side}-zones [data-deck-count]`):self&&p.card?hand.current.get(p.card.instanceId):root?.querySelector(`.ko-${side}-hand`);
   if(!destination)continue;const target=destination.getBoundingClientRect();
   const source=old.get(p.sourceId??'')??current.get(p.sourceId??'');
   const card=p.card;
   if(!card&&self)continue;
   const from=source??{left:target.left,top:target.top-24,width:Math.min(80,target.width),height:112};
   next.push({id:`${state.gameId}:${state.events.length}:${p.kind}:${p.id}`,kind:p.kind,card:card??null,concealed:!self||p.kind==='RETURN_DECK',cosmeticOwnerId:p.playerId,geometry:{left:from.left,top:from.top,width:from.width,height:from.height},destination:{left:target.left+target.width/2,top:target.top+target.height/2},targetScale:Math.min(1,target.width/Math.max(1,from.width)),delay:0});
  }
  if(next.length)setFlights(oldFlights=>[...oldFlights,...next].slice(-6));
  const oldHand=new Set(before.players[0].hand.map(c=>c.instanceId));
  for(const card of state.players[0].hand){
   const node=hand.current.get(card.instanceId);if(!node)continue;
   if(!oldHand.has(card.instanceId)){for(const part of arrivalStatParts(card))animate(node.querySelector(`[data-card-stat="${part}"]`),[{color:'#e4c779',scale:'1.2'},{scale:'1'}]);}
   if(state.events.slice(before.events.length).some(e=>e.type==='CARD_TEXT_GRANTED'&&e.cardInstanceId===card.instanceId))animate(node.querySelector('[data-card-rules]'),[{filter:'brightness(1.6)'},{filter:'brightness(1)'}]);
  }
 },[state,introActive,ready,hand,board]);
 useLayoutEffect(()=>()=>{motions.current.forEach(a=>a.cancel());if(waveTimer.current)clearTimeout(waveTimer.current);},[]);
 useLayoutEffect(()=>{const clear=()=>{setFlights([]);setWaves([]);positions.current=new Map([...board.current,...hand.current].map(([id,node])=>[id,node.getBoundingClientRect()]));};window.addEventListener('resize',clear);return()=>window.removeEventListener('resize',clear);},[]);
 return <><span ref={host} hidden/>{waves.length>0&&!prefersReducedMotion()&&createPortal(<svg className="ko-effect-wave" viewBox={`0 0 ${innerWidth} ${innerHeight}`} aria-hidden="true">{waves.map(w=><g key={w.id} data-effect-wave={w.id}>{w.targets.map((t,i)=><g key={i} style={{animationDelay:`${i*25}ms`}}><path d={`M${w.from.x} ${w.from.y} Q${(w.from.x+t.x)/2} ${Math.min(w.from.y,t.y)-18} ${t.x} ${t.y}`} pathLength="1"/><image href={`${import.meta.env.BASE_URL}vendor/kenney/particle/circle_03.png`} x={t.x-25} y={t.y-25} width="50" height="50"/></g>)}</g>)}</svg>,document.body)}{flights.map(animation=><CardLeaveAnimation key={animation.id} animation={animation} onComplete={()=>setFlights(items=>items.filter(x=>x.id!==animation.id))}/>)}</>;
}
