import {useEffect,useRef,type RefObject} from 'react';
import type {GameState,CardInstance} from '@/game';
import type {GameEvent} from '@/game/events/types';
import {emitPixelFx} from './pixelfx-scenes';
import type {EffectId} from './pixelfx-sprite';

type Nodes={board:RefObject<Map<string,HTMLDivElement>>;hand:RefObject<Map<string,HTMLDivElement>>;self:RefObject<HTMLDivElement|null>;enemy:RefObject<HTMLDivElement|null>};
export function championPixelFx(name:string):EffectId{
 const themes:[RegExp,EffectId][]=[[/나토|토마/,'nature/spore-burst'],[/칼라베라/,'shadow/necro-skulls'],[/로지/,'scifi/hologram'],[/벨모|베르모/,'shadow/dark-explosion'],[/마카롱/,'projectiles/bullet-tracer'],[/여울/,'ui/coin-collect'],[/예거/,'scifi/scanner'],[/크루세/,'holy/blessing'],[/판도라/,'shadow/void-orb'],[/퍼플/,'shadow/hex-sigil'],[/스타.*세븐|스타.*7/,'pickups/power-star']];
 return themes.find(([pattern])=>pattern.test(name))?.[1]??'arcane/spell-charge';
}
export function finisherPixelFx(name:string):EffectId{
 const themes:[RegExp,EffectId][]=[[/언데드/,'shadow/necro-skulls'],[/뇌진탕/,'impacts/crit-hit'],[/대폭주/,'shadow/dark-explosion'],[/토마티나/,'nature/spore-burst'],[/서퍼/,'shadow/soul-drain'],[/마지막 희망/,'holy/holy-pillar'],[/보디가드/,'spawn/summon-rise'],[/래리어트/,'lightning/spark-arc'],[/어셈블/,'arcane/rune-circle'],[/엘리트/,'scifi/scanner'],[/파괴의 강림/,'explosions/implosion'],[/흉내/,'scifi/hologram']];
 return themes.find(([pattern])=>pattern.test(name))?.[1]??'moves/holy-smite';
}
const keywordAreas:Record<string,number>={RUSH:128,SURPRISE:129,TAUNT:17,DODGE:12,MULTI_STRIKE:7,IMMUNE:16,REGEN:52,ARMOR:15,CONDITION:137,DEFENSE:15,LIFESTEAL:51,COUNTDOWN:127,WANTED:130,FUSION:40,CANNOT_ATTACK:18};
function hasAction(card:CardInstance,action:string){
 return card.abilities.some(ability=>'effects' in ability&&ability.effects.some(effect=>effect.type==='STRUCTURED'&&effect.action===action));
}
function visibleCards(state:GameState){return state.players.flatMap((player,index)=>[...player.board.filter((card):card is CardInstance=>!!card),...(index===0?player.hand:[])]);}
/** Observe confirmed public snapshots. First mount/reconnect is a baseline, never a replay. */
export function usePixelFxBattle(state:GameState,nodes:Nodes,selection:string|null,error:string|null|undefined,seconds?:number|null){
 const previous=useRef<GameState|null>(null),selected=useRef(selection),lastError=useRef(error),warningTurn=useRef('');
 useEffect(()=>{
  const old=previous.current;previous.current=state;
  if(!old||old.gameId!==state.gameId)return;
  const selfId=state.players[0]?.id;
  const node=(id?:string)=>id?nodes.board.current.get(id)??nodes.hand.current.get(id)??(id===selfId?nodes.self.current:state.players.some(p=>p.id===id)?nodes.enemy.current:null):null;
  const play=(area:number,id?:string,effect?:EffectId)=>{const target=node(id);if(target)emitPixelFx(area,target,{effect,width:Math.min(target.getBoundingClientRect().width,230)});};
  // Appended event prefix only. Truncated or replaced histories establish a new baseline.
  if(old.openingMulligan&&!state.openingMulligan)emitPixelFx(74,nodes.self.current);
  if(state.targetingState?.active&&!old.targetingState?.active)play(61,state.targetingState.playerId);
  const events=state.events.length>=old.events.length?state.events.slice(old.events.length):[];
  const seen=new Set<string>();
  for(const event of events){
   const target=event.target?.type==='CARD'?event.target.cardInstanceId:event.target?.type==='PLAYER'?event.target.playerId:event.cardInstanceId??event.playerId;
   const key=`${event.type}:${target}:${event.sourceContext?.sourceEffectId??''}`;
   if(seen.has(key))continue;seen.add(key);
   if(event.type==='ATTACK_DECLARED'){
    const id=event.source?.type==='CARD'?event.source.cardInstanceId:event.cardInstanceId;
    const card=visibleCards(state).find(c=>c.instanceId===id);
    play(card?.keywords.includes('MULTI_STRIKE')?7:3,id);
   }
   if(event.type==='PROGRAM_ACTIVATED')play(8,target);
   if(event.type==='CARD_REVEALED')play(139,target);
   if(event.type==='CARD_TEXT_GRANTED')play(132,target);
   if(event.type==='CHAMPION_ABILITY_CHANGED')play(138,event.playerId);
   if(event.type==='CHAMPION_ABILITY_USED'){
    const owner=state.players.find(p=>p.id===event.playerId);
    play(62,event.playerId,championPixelFx(owner?.champion?.name??''));
   }
   if(event.type==='CHAMPION_QUEST_PROGRESS')play(63,event.playerId);
   if(event.type==='MULLIGAN_COMPLETED')play(75,event.playerId);
   if(event.type==='TURN_STARTED')play(76,event.playerId);
   if(event.type==='TURN_ENDED')for(const card of visibleCards(old))if(hasAction(card,'REPEAT_TURN_END'))play(134,card.instanceId);
   if(event.type==='CARD_DRAWN')play(35,event.playerId);
   if(event.type==='CARD_GENERATED'||event.type==='CARD_ADDED_TO_HAND')play(36,target);
   if(event.type==='GOLD_CHANGED')play((event.amount??0)<0?55:56,event.playerId);
   if(event.type==='STAT_CHANGED'&&event.stat==='cost')play((event.delta??0)<0?53:54,target);
   if(event.type==='CARD_DISCARDED')play(37,event.playerId);
   if(event.type==='DAMAGE_DEALT'&&(event.amount??0)>0){
    const source=event.source?.type==='CARD'?visibleCards(old).find(c=>c.instanceId===(event.source as {cardInstanceId:string}).cardInstanceId):undefined;
    if(source&&/剣|검|베기|칼|할퀴|채찍/.test(state.cardPool?.find(d=>d.id===source.definitionId)?.name??''))play(5,target);
    if(source?.keywords.includes('LIFESTEAL'))play(51,source.instanceId);
    if(source)for(const card of visibleCards(old))if(hasAction(card,'ADD_DAMAGE_MODIFIER'))play(136,card.instanceId);
   }
   if(event.type==='DAMAGE_DEALT'&&event.tags?.includes('DODGE'))play(12,target);
   if(event.type==='DAMAGE_DEALT'&&event.exactZero&&event.pinfallEligible)play(10,target);
   if(event.type==='ENTER_FIELD'){
    const card=visibleCards(state).find(c=>c.instanceId===event.cardInstanceId);
    const cause=(event as GameEvent&{entryCause?:string}).entryCause;
    if(cause==='REVIVE')play(event.source?.type==='CARD'&&event.source.cardInstanceId===event.cardInstanceId?29:28,target);
    else if(card?.isChampionToken){play(69,target);if(card.entryDefenseActive||card.keywords.includes('IMMUNE'))play(70,target);}
    else if(card?.isToken)play(27,target);
   }
  }
  // Collapse real multi-target resolution into one field overlay, retaining individual numbers.
  const damageEvents=events.filter(event=>event.type==='DAMAGE_DEALT'&&event.sourceContext?.sourceActionType!=='ATTACK');
  if(damageEvents.length>=2&&damageEvents.some(event=>{const id=event.source?.type==='CARD'?event.source.cardInstanceId:undefined;const card=visibleCards(old).find(c=>c.instanceId===id);return /RANDOM|무작위/.test(event.reason??'')||!!card&&JSON.stringify(card.abilities).includes('RANDOM');}))emitPixelFx(47,nodes.enemy.current,{width:Math.min(innerWidth*.7,650)});
  if(damageEvents.length>=3&&new Set(damageEvents.map(event=>event.sourceContext?.sourceEffectId??JSON.stringify(event.source))).size===1){const target=nodes.enemy.current;const rect=target?.getBoundingClientRect();if(rect)emitPixelFx(46,target,{width:Math.min(innerWidth*.7,650)});}
  const heals=events.filter(event=>event.type==='STAT_CHANGED'&&event.stat==='currentHealth'&&(event.delta??0)>0);
  if(heals.length>=3)emitPixelFx(50,nodes.self.current,{width:Math.min(innerWidth*.65,550)});
  const before=new Map(visibleCards(old).map(card=>[card.instanceId,card]));
  for(const card of visibleCards(state)){
   const prior=before.get(card.instanceId);if(!prior)continue;
   const id=card.instanceId;
   if(card.currentAttack===prior.currentHealth&&card.currentHealth===prior.currentAttack&&card.currentAttack!==prior.currentAttack)play(123,id);
   if(card.currentAttack>prior.currentAttack&&JSON.stringify(card.lastRetiredStats)!==JSON.stringify(prior.lastRetiredStats))play(125,id);
   const newest=(card.statHistory??[]).slice(prior.statHistory?.length??0);
   if(newest.length){
    const sourceId=newest.at(-1)?.sourceInstanceId;
    const source=visibleCards(old).find(c=>c.instanceId===sourceId);
    if(source&&hasAction(source,'COPY_BEST_STATS'))play(124,id);
    if(state.players[0]?.hand.some(c=>c.instanceId===id))play(59,id);
    if(card.keywords.includes('REGEN')&&card.currentHealth>prior.currentHealth&&state.turn!==old.turn)play(52,id);
   }
   for(const keyword of card.keywords)if(!prior.keywords.includes(keyword)&&keywordAreas[keyword])play(keywordAreas[keyword],id);
   if(prior.keywords.some(keyword=>!card.keywords.includes(keyword)))play(131,id);
   if(card.isChampionToken&&(card.entryDefenseActive&&!prior.entryDefenseActive||card.keywords.includes('IMMUNE')&&!prior.keywords.includes('IMMUNE')))play(70,id);
   if(card.isStunned!==prior.isStunned)play(card.isStunned?19:131,id);
   if((card.capturedCards?.length??0)!==(prior.capturedCards?.length??0))play((card.capturedCards?.length??0)>(prior.capturedCards?.length??0)?121:122,id);
   if(card.countdownRemaining!==prior.countdownRemaining&&card.countdownRemaining!==undefined)play(127,id);
   if(card.temporaryStatModifiers?.some(mod=>mod.source==='TOWER_RELIC')&&card.currentAttack!==prior.currentAttack)play(105,id);
   if(card.grantedText?.donorDefinitionId!==prior.grantedText?.donorDefinitionId&&card.grantedText)play(132,id);
  }
  for(const player of state.players){const prior=old.players.find(p=>p.id===player.id);if(!prior)continue;
   if(player.champion?.questCompleted&&!prior.champion?.questCompleted)play(67,player.id);
   if(player.champion&&prior.champion&&player.champion.questProgress>prior.champion.questProgress&&!player.champion.questCompleted) {
    const goal=player.champion.quest?.requiredProgress;
    if(typeof goal==='number'&&goal-player.champion.questProgress===1)play(64,player.id);
   }
   if(player.champion?.ability!==prior.champion?.ability&&JSON.stringify(player.champion?.ability)!==JSON.stringify(prior.champion?.ability))play(138,player.id);
   if(player.health<=0&&prior.health>0)play(72,player.id);
   if(player.nextTurnGoldBonus>prior.nextTurnGoldBonus)play(57,player.id);
   if(player.deck.length<prior.deck.length&&!events.some(event=>event.type==='CARD_DRAWN'&&event.playerId===player.id))play(126,player.id);
   if(player.id===selfId&&player.deck.some(card=>{const before=prior.deck.find(c=>c.instanceId===card.instanceId);return before&&(before.currentAttack!==card.currentAttack||before.maxHealth!==card.maxHealth);}))play(58,player.id);
   if(player.fatigueCount>prior.fatigueCount)play(60,player.id);
   const oldIds=new Set(prior.board.filter(Boolean).map(c=>c!.instanceId));
   for(const card of player.board)if(card&&!oldIds.has(card.instanceId)&&old.players.some(p=>p.id!==player.id&&p.board.some(c=>c?.instanceId===card.instanceId)))play(38,card.instanceId);
  }
  if(state.tower?.usedTurn&&JSON.stringify(state.tower.usedTurn)!==JSON.stringify(old.tower?.usedTurn))play(105,state.tower.playerId);
  for(const id of state.preventedDamageTargetIds??[])if(!old.preventedDamageTargetIds?.includes(id))play(16,id);
  for(const id of state.preventedRetireTargetIds??[])if(!old.preventedRetireTargetIds?.includes(id))play(135,id);
  if(old.targetingState?.active&&!state.targetingState?.active){
   const source=old.targetingState.sourceInstanceId;
   if(events.length)play(119,source);else play(118,source);
  }
  for(const pending of old.pendingRuleListeners){const next=state.pendingRuleListeners.find(p=>p.id===pending.id);if(next&&next.uses!==pending.uses)play(137,pending.sourceInstanceId);}
  for(const pending of old.pendingDelayedEffects)if(events.length&&pending.dueTurn<=state.turn&&!state.pendingDelayedEffects.some(p=>p.id===pending.id))play(133,pending.sourceInstanceId);
  for(const pending of state.pendingRuleListeners)if(!old.pendingRuleListeners.some(p=>p.id===pending.id))play(137,pending.sourceInstanceId);
 },[state]);
 useEffect(()=>{
  if(selection!==selected.current){const id=selection??selected.current;selected.current=selection;const target=id?nodes.board.current.get(id)??nodes.hand.current.get(id):null;if(target)emitPixelFx(selection?1:118,target);}
 },[selection]);
 useEffect(()=>{if(error&&error!==lastError.current)emitPixelFx(120,nodes.self.current);lastError.current=error;},[error]);
 useEffect(()=>{const key=`${state.gameId}:${state.turn}`;if(seconds&&seconds<=10&&warningTurn.current!==key){warningTurn.current=key;emitPixelFx(77,nodes.self.current);}},[seconds,state.turn,state.gameId]);
}

export function damagePixelFx(text:string):EffectId|undefined{
 if(/불꽃|화염|불길|파이어|fire/i.test(text))return 'fire/fireball';
 if(/전격|번개|뇌격|전류|lightning/i.test(text))return 'lightning/lightning-strike';
 if(/암흑|악마|공허|마왕|shadow/i.test(text))return 'shadow/void-orb';
 if(/얼음|빙결|서리|ice/i.test(text))return 'ice/frost-nova';
 if(/물결|파도|water/i.test(text))return 'water/water-orb';
 return undefined;
}
