import type { CardInstance } from '../cards/types';
import type { NewCardRule } from '../cards/new-card-effects';
import type { GameState } from '../types/game-state';

export function hasNewCardRule(card:CardInstance|null|undefined,rule:NewCardRule):boolean {
  return Boolean(card && !card.isAbilityDisabled && ((!card.isSilenced && card.contentRule===rule) || card.grantedText?.contentRule===rule));
}
export function silenceDamageReduction(target:CardInstance,source?:CardInstance):number {
  return hasNewCardRule(target,'사일런스') && source?.isSilenced ? 2 : 0;
}
export function healingTurn(state:GameState):number {
  for(let i=state.events.length-1;i>=0;i--) {
    if(state.events[i]!.type==='TURN_STARTED')return state.turn;
    if(state.events[i]!.type==='TURN_ENDED')return state.turn-1;
  }
  return state.turn;
}
/** Records attempted overhealing even without Casto; absent metadata keeps old saves compatible. */
export function healNewCardAware(state:GameState,playerId:string,amount:number,targetId?:string):GameState {
  if(amount<=0)return state;
  const p=state.players.find(p=>p.id===playerId);if(!p)return state;
  const c=targetId?p.board.find(c=>c?.instanceId===targetId):undefined;
  if(targetId&&!c)return state;
  const health=c?c.currentHealth:p.health, max=c?c.maxHealth:p.maxHealth;
  const overflow=Math.max(0,health+amount-max);
  const grow=p.board.some(c=>hasNewCardRule(c,'카스토'))?overflow:0;
  const nextMax=max+grow,nextHealth=Math.min(nextMax,health+amount);
  const turn=healingTurn(state),key=`${turn}:${playerId}`;
  return {...state,overhealByTurn:{...state.overhealByTurn,[key]:(state.overhealByTurn?.[key]??0)+overflow},players:state.players.map(owner=>owner.id!==playerId?owner:c?{...owner,board:owner.board.map(card=>card?.instanceId===targetId?{...card,currentHealth:nextHealth,maxHealth:nextMax}:card) as typeof owner.board}:{...owner,health:nextHealth,maxHealth:nextMax,champion:owner.champion?{...owner.champion,health:nextHealth,maxHealth:nextMax}:null})};
}
