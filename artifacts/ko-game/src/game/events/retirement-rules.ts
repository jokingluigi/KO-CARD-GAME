import type {GameState} from '../types/game-state';

/** Counterattack retirements still exist for quests/death listeners, but do not
 * award personal retirement-trigger effects. Explicit effect kills remain valid. */
export function isCounterattackRetirement(state:GameState,eventIndex:number):boolean {
 const event=state.events[eventIndex];
 if(event?.type!=='CARD_RETIRED' || event.source?.type!=='CARD')return false;
 const sourceId=event.source.cardInstanceId;
 const targetId=event.target?.type==='CARD'?event.target.cardInstanceId:event.cardInstanceId;
 for(let i=eventIndex-1;i>=0;i--){
  const hit=state.events[i]!;
  if(hit.type!=='DAMAGE_DEALT'||hit.source?.type!=='CARD'||hit.source.cardInstanceId!==sourceId||hit.target?.type!=='CARD'||hit.target.cardInstanceId!==targetId)continue;
  if(event.sourceContext?.rootSourceEventId && hit.sourceContext?.rootSourceEventId!==event.sourceContext.rootSourceEventId)continue;
  if(event.sourceContext?.causationId && hit.sourceContext?.causationId!==event.sourceContext.causationId)continue;
  if(hit.reason!=='COMBAT')return false;
  if(hit.sourceContext?.combatRole)return hit.sourceContext.combatRole==='DEFENDER';
  // Compatibility for serialized games created before combatRole existed.
  for(let j=i-1;j>=0;j--){
   const attack=state.events[j]!;
   if(attack.type!=='ATTACK_DECLARED')continue;
   return attack.source?.type==='CARD'&&attack.source.cardInstanceId===targetId&&attack.target?.type==='CARD'&&attack.target.cardInstanceId===sourceId;
  }
  return false;
 }
 return false;
}
