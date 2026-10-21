import type { GameState } from '../types/game-state';
import { getActiveCardAbilities, getActiveCardKeywords } from '../cards/granted-text';
import { hasCardTag } from '../cards/tags';

/** Grants are acquired once per field entry and persist after their condition leaves. */
export function refreshPersistentFieldGrants(state: GameState): GameState {
 const keys = new Set(state.consumedNewCardEventKeys ?? []);
 let changed = false;
 const players = state.players.map(player => {
  const board = player.board.map(card => {
   if (!card || card.currentHealth <= 0 || card.isAbilityDisabled) return card;
   const rules = getActiveCardAbilities(card).flatMap(ability => 'persistentFieldGrants' in ability && ability.persistentFieldGrants ? [ability.persistentFieldGrants] : []);
   if (!rules.length) return card;
   let next = card;
   const entryIndex = state.events.reduce((last,event,index)=>event.type === 'ENTER_FIELD' && event.cardInstanceId === card.instanceId ? index : last,-1);
   for (const rule of rules) for (const [kind, condition] of [['ARMOR',rule.armorTag],['REGEN',rule.regenNameContains]] as const) {
    if (!condition) continue;
    const key = `persistent-field-grant:${card.instanceId}:${card.definitionId}:${entryIndex}:${kind}`;
    if (keys.has(key)) continue;
    // Field card/tag existence conditions never satisfy themselves.
    const met = player.board.some(ally => ally && ally.instanceId !== card.instanceId && ally.currentHealth > 0 && (kind === 'ARMOR'
     ? hasCardTag({tags:[...(ally.tags??[]),...(ally.grantedTags??[])]},condition)
     : (state.cardPool?.find(d=>d.id===ally.definitionId)??state.minionACardPool?.find(d=>d.id===ally.definitionId))?.name.includes(condition)));
    if (!met) continue;
    keys.add(key); changed = true;
    const armor = kind === 'ARMOR' ? (getActiveCardKeywords(next).includes('ARMOR') ? next.grantedText?.armor ?? next.armor ?? 0 : 0) + 1 : next.armor;
    next = {...next,armor,keywords:[...new Set([...next.keywords,kind])],
     ...(next.grantedText ? {grantedText:{...next.grantedText,armor,keywords:[...new Set([...next.grantedText.keywords,kind])]}} : {})};
   }
   return next;
  }) as typeof player.board;
  return board.some((card,index)=>card!==player.board[index]) ? {...player,board} : player;
 });
 return changed ? {...state,players,consumedNewCardEventKeys:[...keys]} : state;
}

export function bonusGoldInterceptors(state: GameState, recipientId: string) {
 return state.players.filter(player=>player.id!==recipientId).flatMap(player=>player.board.flatMap(card=>
  card && card.currentHealth>0 && !card.isAbilityDisabled && getActiveCardAbilities(card).some(ability=>('interceptOpponentTurnBonusGold' in ability && ability.interceptOpponentTurnBonusGold)||('stealOpponentBonusGold' in ability && ability.stealOpponentBonusGold))
   ? [{playerId:player.id,cardInstanceId:card.instanceId,steal:getActiveCardAbilities(card).some(a=>'stealOpponentBonusGold' in a&&a.stealOpponentBonusGold)}] : []));
}

/** A grant is intercepted once even if several copies see it. Reservations never recurse. */
export function interceptImmediateBonusGold(state:GameState,recipientId:string,amount:number):GameState|undefined {
 if(amount<=0)return undefined;
 const stealers=bonusGoldInterceptors(state,recipientId).filter(i=>i.steal);
 if(!stealers.length)return undefined;
 const owner=stealers[0]!.playerId;
 return {...state,players:state.players.map(p=>p.id===owner?{...p,nextTurnGoldBonus:p.nextTurnGoldBonus+amount}:p),events:[...state.events,{type:'GOLD_CHANGED',playerId:recipientId,source:{type:'CARD',cardInstanceId:stealers[0]!.cardInstanceId},target:{type:'PLAYER',playerId:recipientId},reason:'BONUS_GOLD_INTERCEPTED',amount:0}]};
}
