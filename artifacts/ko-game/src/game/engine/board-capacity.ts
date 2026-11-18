import type {GameState} from '../types/game-state';
/** Standard four-slot board capacity, shared by play, summon and champion rewards. */
export function firstVacantBoardSlot(state:GameState,playerId:string):number{
 return state.players.find(player=>player.id===playerId)?.board.findIndex(card=>card===null)??-1;
}
export function hasVacantBoardSlot(state:GameState,playerId:string):boolean{
 return firstVacantBoardSlot(state,playerId)>=0;
}
