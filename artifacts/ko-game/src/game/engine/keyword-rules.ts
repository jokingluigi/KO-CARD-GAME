import { healNewCardAware } from './new-card-rules';
import type { CardInstance } from '../cards/types';
import type { GameState } from '../types/game-state';
import { getActiveCardAbilities, getActiveCardKeywords } from '../cards/granted-text';
import { evaluateChampionQuestCondition, validChampionQuestCondition } from '../../../../../lib/game-engine/src/champion-quest-conditions';
export function hasEntryDefense(card: CardInstance, turn: number): boolean {
 return getActiveCardKeywords(card).includes('DEFENSE') && (card.entryDefenseActive ?? (card.enteredOnTurn !== undefined ? turn <= card.enteredOnTurn + 1 : card.enteredThisTurn));
}
/** Only live field cards have entry protection; a stale zone copy is not protected. */
export function isEntryDefenseTargetProtected(state: GameState, card: CardInstance): boolean {
 return hasEntryDefense(card, state.turn) && state.players.some(player => player.board.some(entry => entry?.instanceId === card.instanceId));
}
export function keywordDamage(card: CardInstance, amount: number, turn: number, source: 'COMBAT' | 'EFFECT' = 'COMBAT', state?:GameState): number {
 const keywords=getActiveCardKeywords(card);
 if(hasEntryDefense(card,turn))return 0;
 const damage=Math.max(0,amount-(source === 'COMBAT' && keywords.includes('ARMOR')?card.grantedText?.armor??card.armor??0:0));
 const limit=getActiveCardAbilities(card).flatMap(ability=>'incomingDamageLimitPerTurn' in ability && ability.incomingDamageLimitPerTurn!==undefined?[ability.incomingDamageLimitPerTurn]:[]);
 if(!state || !limit.length || card.isAbilityDisabled)return damage;
 const start=state.events.reduce((last,event,index)=>event.type==='TURN_STARTED'?index:last,-1);
 const taken=state.events.slice(start+1).filter(event=>event.type==='DAMAGE_DEALT' && event.target?.type==='CARD' && event.target.cardInstanceId===card.instanceId).reduce((total,event)=>total+Math.max(0,event.amount??0),0);
 return Math.min(damage,Math.max(0,Math.min(...limit)-taken));
}
export function canPlayConditionalCard(state:GameState,playerId:string,card:CardInstance):boolean {
 if(!getActiveCardKeywords(card).includes('CONDITION'))return true;
 const condition = card.grantedText?.playCondition ?? card.playCondition;
 return validChampionQuestCondition(condition)&&evaluateChampionQuestCondition(condition,state,playerId,state.events).completed;
}
export function healLifesteal(state:GameState,playerId:string,card:CardInstance,amount:number):GameState {
 if(amount<=0||!getActiveCardKeywords(card).includes('LIFESTEAL'))return state;
 return healNewCardAware(state,playerId,amount);
}
