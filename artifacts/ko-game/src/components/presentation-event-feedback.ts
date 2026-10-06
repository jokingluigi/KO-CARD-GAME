import type { CardInstance } from '@/game';
import type { GameEvent } from '@/game/events/types';
import { getActiveCardKeywords } from '../game/cards/granted-text';
import type { PresentationCueDraft } from './presentation-feedback-utils';
type StatusCue = PresentationCueDraft & { eventIndex?: number };
export function withEffectSources(cues:PresentationCueDraft[]):PresentationCueDraft[] {
 const shown=new Set<string>();const result:PresentationCueDraft[]=[];
 for(const cue of cues) {
  if(cue.sourceCardInstanceId&&!cue.combat&&!['RETIRE','REMOVE','BLOCK','DODGE'].includes(cue.kind)&&!shown.has(cue.sourceCardInstanceId)){
   shown.add(cue.sourceCardInstanceId);
   result.push({id:'effect:'+cue.id,kind:'EFFECT',label:'효과',cardInstanceId:cue.sourceCardInstanceId,duration:160});
  }
  result.push(cue);
 }
 return result;
}
export function statusPresentation(events:GameEvent[],before:Map<string,CardInstance>,after:Map<string,CardInstance>,batch:string):StatusCue[] {
 const result:StatusCue[]=[];
 for(const [id,card] of after) {
  const old=before.get(id);
  if(old&&!old.isSilenced&&card.isSilenced)result.push({id:batch+':silence:'+id,kind:'SILENCE',label:'침묵',cardInstanceId:id,duration:240});
 }
 for(const [index,event] of events.entries()){
  if(event.type!=='DAMAGE_DEALT'||event.reason!=='COMBAT'||event.target?.type!=='CARD'||event.tags?.some(tag=>['BLOCKED','DODGE'].includes(tag)))continue;
  const id=event.target.cardInstanceId,card=before.get(id);
  if(card&&!(getActiveCardKeywords(card).includes('DEFENSE')&&(card.entryDefenseActive??card.enteredThisTurn))&&getActiveCardKeywords(card).includes('ARMOR')&&(card.grantedText?.armor??card.armor??0)>0)
   result.push({id:batch+':armor:'+index,kind:'ARMOR',label:'아머',cardInstanceId:id,duration:180,eventIndex:index});
 }
 return result;
}
/** A shield cue stays adjacent to its damage event; unrelated events never move. */
export function mergeStatusPresentation(drafts:PresentationCueDraft[],status:StatusCue[],eventKeys:string[]):PresentationCueDraft[] {
 const pending=new Map(status.filter(c=>c.kind==='ARMOR').map(c=>[eventKeys[c.eventIndex??-1],c]));
 const result:PresentationCueDraft[]=[];
 for(const cue of drafts){
  for(const [key,shield] of pending)if(key&&cue.kind!=='EFFECT'&&cue.id.startsWith(key)){
   result.push(shield);pending.delete(key);break;
  }
  result.push(cue);
 }
 result.push(...status.filter(c=>c.kind!=='ARMOR'));
 return result;
}
