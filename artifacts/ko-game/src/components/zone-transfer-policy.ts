import type {GameState,CardInstance} from '@/game';
export type VisibleZone='BOARD'|'HAND'|'DECK'|'GRAVEYARD';
export type ZoneTransfer={id:string;card:CardInstance;from:VisibleZone;to:VisibleZone;ownerId:string;opponent:boolean};
export function zoneTransfers(before:GameState|null,after:GameState,viewerId=after.players[0].id):ZoneTransfer[]{
 if(!before||before.gameId!==after.gameId)return [];
 const result:ZoneTransfer[]=[];
 for(const player of after.players){
  const old=before.players.find(p=>p.id===player.id);if(!old)continue;
  const opponent=player.id!==viewerId;
  const pairs:Array<[VisibleZone,VisibleZone,Array<CardInstance|null>,CardInstance[]]>=[['BOARD','HAND',old.board,player.hand],['GRAVEYARD','HAND',old.graveyard,player.hand],['HAND','DECK',old.hand,player.deck]];
  for(const [from,to,source,destination] of pairs){
   for(const card of source){if(!card||!destination.some(c=>c.instanceId===card.instanceId))continue;
    // Sanitized opponent hands do not expose stable identities; never invent a reveal.
    if(opponent&&(from==='HAND'||to==='HAND'))continue;
    result.push({id:after.gameId+':zone:'+after.events.length+':'+card.instanceId+':'+from+':'+to,card,from,to,ownerId:player.id,opponent});
   }
  }
 }
 return result;
}
