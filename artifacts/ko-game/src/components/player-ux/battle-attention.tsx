import {useEffect,useRef} from 'react';
import type {GameState} from '@/game';
import {prefersReducedMotion} from '../presentation-config';
import {attentionPlans} from './attention-policy';
/** One local emphasis channel; no queue, busy gate or layout/transform changes. */
export function BattleAttention({state}:{state:GameState}) {
  const host=useRef<HTMLSpanElement>(null), previous=useRef(state), active=useRef(new Map<Element,Animation>());
  useEffect(()=>{
    const old=previous.current;previous.current=state;
    const root=host.current?.closest('.ko-game-stage');
    if(old.gameId!==state.gameId||state.status!=='IN_PROGRESS'||document.hidden){active.current.forEach(a=>a.cancel());active.current.clear();return;}
    for(const plan of attentionPlans(old,state)){
      const side=plan.playerId===state.players[0].id?'player':'opponent';
      const pulse=(node:Element|null|undefined)=>{
        if(!node||typeof node.animate!=="function")return;
        active.current.get(node)?.cancel();
        const a=node.animate([{boxShadow:'inset 0 0 0 2px #e8c777',color:'#fff0c4'},{boxShadow:'inset 0 0 0 0px transparent'}],{duration:prefersReducedMotion()?160:480,easing:'ease-out'});
        active.current.set(node,a);a.finished.catch(()=>{}).finally(()=>{if(active.current.get(node)===a)active.current.delete(node);});
      };
      if(plan.spent)pulse(root?.querySelector(`.ko-${side}-stats [data-resource="gold"]`));
      if(plan.quest)pulse(root?.querySelector(`.ko-${side}-quest > div`));
    }
  },[state]);
  useEffect(()=>()=>{active.current.forEach(a=>a.cancel());active.current.clear();},[]);
  return <span ref={host} hidden/>;
}
