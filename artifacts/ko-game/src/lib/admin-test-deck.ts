import {createInitialGameState} from '../game/engine/create-initial-game-state';
import type {CardDefinition} from '../game/cards/types';
import type {ChampionDefinition} from '../game/champions/types';
export function createAdminTestDeckState(cards:CardDefinition[],champions:ChampionDefinition[],championIds:[string,string],decks:[string[],string[]]){
 for(const deck of decks){if(!deck.length||deck.length>60)throw new Error('테스트 덱은 1~60장으로 구성해 주세요.');for(const id of deck){const card=cards.find(c=>c.id===id);if(!card||card.isToken||card.isChampionToken)throw new Error('덱에 넣을 수 없는 카드입니다.');}}
 return createInitialGameState(championIds,cards,champions,decks,{gameId:`admin-test-${crypto.randomUUID()}`});
}
