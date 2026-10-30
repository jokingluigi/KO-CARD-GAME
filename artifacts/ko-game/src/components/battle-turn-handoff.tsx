import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {GameState} from '@/game';
import {prefersReducedMotion} from './presentation-config';
import './battle-atmosphere.css';
/** Only a new authoritative turn, not mounting/reconnecting, gets a handoff. */
export function BattleTurnHandoff({state}:{state:GameState}) {
  const host=useRef<HTMLSpanElement>(null);
  const previous=useRef({game:state.gameId,turn:state.turn,active:state.activePlayerId});
  const [cue,setCue]=useState<{id:string;boxes:{left:number;top:number;width:number;height:number}[]}|null>(null);
  useEffect(()=>{
    const prior=previous.current;
    previous.current={game:state.gameId,turn:state.turn,active:state.activePlayerId};
    if(prior.game!==state.gameId || state.status!=='IN_PROGRESS' || document.hidden) {setCue(null);return;}
    if(prior.turn===state.turn && prior.active===state.activePlayerId)return;
    const stage=host.current?.closest('.ko-game-stage');
    const side=state.activePlayerId===state.players[0].id?'player':'opponent';
    const nodes=[stage?.querySelector(`.ko-${side}-board-row`),stage?.querySelector(`.ko-${side}-stats`),...(side==='player'?[stage?.querySelector('.ko-player-hand')]:[])];
    setCue({id:`${state.gameId}:${state.turn}:${state.activePlayerId}`,boxes:nodes.flatMap(n=>{
      if(!n)return [];const r=n.getBoundingClientRect();return [{left:r.left,top:r.top,width:r.width,height:r.height}];
    })});
    const clear=()=>setCue(null);
    const timer=setTimeout(clear,prefersReducedMotion()?200:650);
    window.addEventListener('resize',clear);document.addEventListener('visibilitychange',clear);
    return()=>{clearTimeout(timer);window.removeEventListener('resize',clear);document.removeEventListener('visibilitychange',clear);};
  },[state.gameId,state.turn,state.activePlayerId,state.status]);
  return <><span ref={host} hidden/>{cue&&createPortal(<div className="ko-turn-handoff" aria-hidden="true" key={cue.id}>{cue.boxes.map((box,i)=><i key={i} style={{...box,animationDelay:`${i*60}ms`}}/>)}</div>,document.body)}</>;
}
