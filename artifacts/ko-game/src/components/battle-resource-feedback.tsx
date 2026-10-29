import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import type {GameState} from '@/game';
import {getActiveCardKeywords} from '../game/cards/granted-text';
import {prefersReducedMotion} from './presentation-config';
import './physical-card.css';
type Flight={id:string;kind:'gold'|'drain';from:{x:number;y:number};to:{x:number;y:number};fill?:{x:number;y:number;width:number;from:number;to:number}};
/** Reads only committed public resources; does not change/schedule any action. */
export function BattleResourceFeedback({state}:{state:GameState}){
 const host=useRef<HTMLSpanElement>(null),previous=useRef(state),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),[flights,setFlights]=useState<Flight[]>([]);
 useEffect(()=>{const clear=()=>{if(timer.current)clearTimeout(timer.current);setFlights([]);};window.addEventListener("resize",clear);return()=>{window.removeEventListener("resize",clear);if(timer.current)clearTimeout(timer.current);};},[]);
 useEffect(()=>{
  const old=previous.current;previous.current=state;
  if(old.gameId!==state.gameId||old.events.length>state.events.length||state.status!=='IN_PROGRESS'||document.hidden||prefersReducedMotion()){setFlights([]);return;}
  const root=host.current?.closest('.ko-game-stage');if(!root)return;
  const center=(n:Element|null|undefined)=>{if(!n)return null;const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};};
  const side=(id:string)=>id===state.players[0].id?'player':'opponent';
  const portrait=(id:string)=>root.querySelector(`.ko-${side(id)}-champion`);
  const card=(id:string)=>root.querySelector(`[data-card-instance-id="${CSS.escape(id)}"]`);
  const events=state.events.slice(old.events.length),next:Flight[]=[];
  for(const [i,e]of events.entries()){
   if(e.type==='GOLD_CHANGED'&&e.playerId&&(e.amount??0)!==0){
    const gold=root.querySelector(`.ko-${side(e.playerId)}-stats`),goldAt=center(gold);if(!goldAt)continue;
    const played=events.find(p=>p.type==='CARD_PLAYED'&&p.playerId===e.playerId&&(!e.presentationResolutionId||!p.presentationResolutionId||e.presentationResolutionId===p.presentationResolutionId));
    const destination=played?.cardInstanceId?card(played.cardInstanceId):portrait(e.playerId);
    const to=(e.amount??0)<0?center(destination):goldAt;
    const from=(e.amount??0)<0?goldAt:{x:goldAt.x,y:goldAt.y+20};
    const owner=state.players.find(p=>p.id===e.playerId),prior=old.players.find(p=>p.id===e.playerId),bounds=gold?.getBoundingClientRect();
    const fill=(e.amount??0)>0&&bounds&&owner&&prior?{x:bounds.x+3,y:bounds.bottom-4,width:Math.max(0,bounds.width-6),from:Math.min(1,prior.currentGold/Math.max(1,Math.min(Math.max(owner.personalTurn,1),6))),to:Math.min(1,owner.currentGold/Math.max(1,Math.min(Math.max(owner.personalTurn,1),6)))}:undefined;
    if(to)next.push({id:`${state.gameId}:${old.events.length+i}:gold`,kind:'gold',from,to,fill});
   }
  }
  for(const p of state.players){
   const before=old.players.find(o=>o.id===p.id);if(!before)continue;
   const healed=(p.presentationHealing?.total??0)-(before.presentationHealing?.total??0);
   if(healed<=0)continue;
   // Ambiguous multi-source batches are left to ordinary healing feedback.
   const hits=events.filter(e=>e.type==='DAMAGE_DEALT'&&(e.amount??0)>0&&e.source?.type==='CARD'&&(e.sourceContext?.combatRole||e.reason==='BASIC_ATTACK'||e.reason==='COMBAT')&&before.board.some(c=>c?.instanceId===(e.source?.type==='CARD'?e.source.cardInstanceId:'')));
   if(hits.length!==1)continue;
   const hit=hits[0],source=hit.source?.type==='CARD'?hit.source.cardInstanceId:undefined;
   const unit=before.board.find(c=>c?.instanceId===source);
   if(!unit||!getActiveCardKeywords(unit).includes('LIFESTEAL')||healed!==Math.min(hit.amount??0,Math.max(0,before.maxHealth-before.health)))continue;
   const from=hit.target?.type==='CARD'?center(card(hit.target.cardInstanceId)):hit.target?.type==='PLAYER'?center(portrait(hit.target.playerId)):null,to=center(portrait(p.id));
   if(from&&to)next.push({id:`${state.gameId}:${state.events.length}:drain:${p.id}`,kind:'drain',from,to});
  }
  if(!next.length)return;
  if(timer.current)clearTimeout(timer.current);
  setFlights(next.slice(-6));timer.current=setTimeout(()=>setFlights([]),600);
 },[state]);
 return <><span hidden ref={host}/>{flights.map(f=>createPortal(<div className="ko-resource-flight" data-kind={f.kind} key={f.id} aria-hidden="true">{f.fill&&<i className="ko-gold-refill" style={{left:f.fill.x,top:f.fill.y,width:f.fill.width,'--fill-from':f.fill.from,'--fill-to':f.fill.to} as CSSProperties}/>}<img alt="" src={`${import.meta.env.BASE_URL}vendor/kenney/particle/star_01.png`} style={{'--from-x':`${f.from.x}px`,'--from-y':`${f.from.y}px`,'--to-x':`${f.to.x}px`,'--to-y':`${f.to.y}px`} as CSSProperties}/></div>,document.body))}</>;
}
