import { healNewCardAware } from './new-card-rules';
import type { CardInstance } from '../cards/types';
import type { GameState } from '../types/game-state';
import { getActiveCardKeywords } from '../cards/granted-text';
import { evaluateChampionQuestCondition, validChampionQuestCondition } from '../../../../../lib/game-engine/src/champion-quest-conditions';
export function hasEntryDefense(card: CardInstance, turn: number): boolean {
 return getActiveCardKeywords(card).includes('DEFENSE') && (card.entryDefenseActive ?? (card.enteredOnTurn !== undefined ? turn <= card.enteredOnTurn + 1 : card.enteredThisTurn));
}
export function keywordDamage(card: CardInstance, amount: number, turn: number, source: 'COMBAT' | 'EFFECT' = 'COMBAT'): number {
 const keywords=getActiveCardKeywords(card);
 if(hasEntryDefense(card,turn))return 0;
 return Math.max(0,amount-(source === 'COMBAT' && keywords.includes('ARMOR')?card.grantedText?.armor??card.armor??0:0));
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
