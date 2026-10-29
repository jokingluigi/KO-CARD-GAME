import type {GameState,CardInstance} from '@/game';
export type ZoneVisualPlan={id:string;kind:'RETURN_HAND'|'RETURN_DECK'|'GENERATE';playerId:string;card?:CardInstance;sourceId?:string};
/** Exact instance identities only. A disappearance alone never means a return. */
export function zoneVisualPlans(before:GameState,after:GameState,viewerId:string):ZoneVisualPlan[]{
 if(before.gameId!==after.gameId||after.events.length<before.events.length)return [];
 const events=after.events.slice(before.events.length),plans:ZoneVisualPlan[]=[];
 const left=new Set(events.filter(e=>['CARD_RETIRED','CARD_DESTROYED','CARD_REMOVED','CARD_VANISHED'].includes(e.type)).map(e=>e.cardInstanceId));
 for(const owner of before.players){
  for(const card of [...owner.board,...(owner.id===viewerId?owner.hand:[])]){
   if(!card||left.has(card.instanceId))continue;
   const wasBoard=owner.board.some(c=>c?.instanceId===card.instanceId);
   for(const next of after.players){
    const hand=next.hand.find(c=>c.instanceId===card.instanceId),deck=next.deck.find(c=>c.instanceId===card.instanceId);
    if(wasBoard&&hand)plans.push({id:card.instanceId,kind:'RETURN_HAND',playerId:next.id,card,sourceId:card.instanceId});
    else if(deck&&!owner.deck.some(c=>c.instanceId===card.instanceId))plans.push({id:card.instanceId,kind:'RETURN_DECK',playerId:next.id,card,sourceId:card.instanceId});
   }
  }
 }
 for(const e of events){
  if(e.type!=='CARD_GENERATED'||!e.playerId||!e.cardInstanceId)continue;
  const owner=after.players.find(p=>p.id===e.playerId),old=before.players.find(p=>p.id===e.playerId);
  const card=owner?.hand.find(c=>c.instanceId===e.cardInstanceId);
  if(owner&&old&&(card||owner.id!==viewerId&&owner.hand.length>old.hand.length))plans.push({id:e.cardInstanceId,kind:'GENERATE',playerId:owner.id,card:owner.id===viewerId?card:undefined,sourceId:e.source?.type==='CARD'?e.source.cardInstanceId:undefined});
 }
 return [...new Map(plans.map(p=>[p.kind+':'+p.id,p])).values()];
}
export function arrivalStatParts(card:CardInstance):Array<'cost'|'attack'|'health'>{
 return [card.currentCost!==(card.baseCost??card.currentCost)?'cost':null,card.currentAttack!==(card.baseAttack??card.currentAttack)?'attack':null,card.maxHealth!==(card.baseHealth??card.maxHealth)?'health':null].filter((x):x is 'cost'|'attack'|'health'=>x!==null);
}

export type EffectWavePlan={id:string;sourceId:string;sourcePlayerId?:string;targets:Array<{cardId?:string;playerId?:string}>};
function hasMultipleTarget(value:unknown,depth=0):boolean {
 if(depth>16||!value||typeof value!=='object')return false;
 const v=value as Record<string,unknown>;
 if(v.selection==='ALL'||typeof v.count==='number'&&v.count>1)return true;
 if(typeof v.type==='string'&&/(_ALL_|ALL_ENEMY|ALL_ALLY)/.test(v.type))return true;
 return Object.values(v).some(child=>hasMultipleTarget(child,depth+1));
}
/** Groups only confirmed noncombat outcomes with shared provenance or an actual
 * multi-target source definition. Card names/artwork never imply causation. */
export function effectWavePlans(before:GameState,after:GameState,lookup?:(id:string)=>unknown):EffectWavePlan[]{
 if(before.gameId!==after.gameId||after.events.length<before.events.length)return [];
 const cards=new Map([...before.players,...after.players].flatMap(p=>[...p.board,...p.hand,...p.graveyard,...p.removedFromGame]).flatMap(c=>c?[[c.instanceId,c] as const]:[]));
 const groups=new Map<string,EffectWavePlan>();
 for(const e of after.events.slice(before.events.length)){
  if(!['DAMAGE_DEALT','STAT_CHANGED'].includes(e.type)||e.reason==='COMBAT'||e.reason==='BASIC_ATTACK'||e.type==='DAMAGE_DEALT'&&(e.amount??0)<=0)continue;
  const championOwner=e.sourceContext?.sourceActionType?.startsWith('USE_CHAMPION_ABILITY') ? e.sourceContext.sourcePlayerId : undefined;
  if((e.source?.type!=='CARD'&&!championOwner)||!e.target||!['CARD','PLAYER'].includes(e.target.type))continue;
  const sourceId=championOwner?`champion:${championOwner}`:e.source?.type==='CARD'?e.source.cardInstanceId:'',source=cards.get(sourceId),definition=after.cardPool?.find(d=>d.id===source?.definitionId) ?? (source ? lookup?.(source.definitionId) as {abilities?:unknown} : undefined);
  const champion=after.players.find(p=>p.id===championOwner)?.champion;
  const multi=hasMultipleTarget(championOwner?champion:definition?.abilities);
  // The engine gives recursive AoE children separate causation IDs. For a
  // verified multi-target source, use this committed snapshot as its visual batch.
  const provenance=e.presentationResolutionId??(multi?sourceId:e.sourceContext?.causationId??e.sourceContext?.rootSourceEventId);
  if(!provenance)continue;
  const id=`${after.gameId}:${before.events.length}:${provenance??sourceId}:${sourceId}`;
  const group=groups.get(id)??{id,sourceId,sourcePlayerId:championOwner,targets:[]};
  const target=e.target.type==='CARD'?{cardId:e.target.cardInstanceId}:e.target.type==='PLAYER'?{playerId:e.target.playerId}:null;
  if(target&&!group.targets.some(t=>JSON.stringify(t)===JSON.stringify(target)))group.targets.push(target);
  groups.set(id,group);
 }
 return [...groups.values()].filter(g=>g.targets.length>1);
}
