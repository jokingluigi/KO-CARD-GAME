import type { GameState } from "../types/game-state";
import type { CardEffect } from "../effects/types";
import type { ChampionAbility, ChampionEffect } from "./types";

function isPandoraDamage(effect: CardEffect | ChampionEffect) {
  return effect.type === "STRUCTURED" && effect.values?.balance?.operation === "PANDORA_DAMAGE";
}
function singleTarget<T extends CardEffect | ChampionEffect>(effect: T): T {
  if (!isPandoraDamage(effect) || effect.type !== "STRUCTURED") return effect;
  return {...effect,target:{...effect.target,zone:"BOARD",owner:effect.target?.owner??"ALL",cardType:"WRESTLER",selection:"PLAYER_CHOICE",count:1,minTargets:1,maxTargets:1}} as T;
}
/** Compatibility for abilities already captured in an ongoing match snapshot. */
export function singleTargetPandoraAbility(ability: ChampionAbility): ChampionAbility {
  if (!ability.effects.some(isPandoraDamage)) return ability;
  return {...ability,description:ability.description.replace("선택한 모든 선수에게","선택한 선수 카드에게"),effects:ability.effects.map(singleTarget)};
}
/** An unfinished legacy multi-select is reopened as a single choice, never
 * auto-applied to all saved selections. Payment/use counters are untouched. */
export function normalizePandoraTargeting(state: GameState): GameState {
  let changed=false;
  const players=state.players.map(player=>{
    const champion=player.champion,quest=champion?.quest,condition=quest?.condition;
    if(champion?.id==='5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c'&&!champion.questCompleted&&quest&&condition?.type==='ZONE_COUNT'&&condition.zone==='GRAVEYARD'&&condition.owner==='SELF'&&condition.tag==='언데드'&&condition.required===10){
      changed=true;
      return {...player,champion:{...champion,quest:{...quest,description:quest.description.replace('10장','8장'),requiredProgress:8,condition:{...condition,required:8}}}};
    }
    if(champion?.id!=='bcffab96-f61f-497e-b60b-de5a869837d3'||champion.questCompleted||!quest||condition?.type!=='EVENT'||condition.event!=='CARD_RETIRED'||!condition.exactZero||condition.required!==5)return player;
    changed=true;
    return {...player,champion:{...champion,quest:{...quest,description:quest.description.replace('5회','8회'),requiredProgress:8,condition:{...condition,required:8}}}};
  });
  if(changed)state={...state,players};
  const pending=state.targetingState;
  if (!pending || !pending.effects[pending.effectIndex] || !isPandoraDamage(pending.effects[pending.effectIndex])) return state;
  if (pending.minTargets===1 && pending.maxTargets===1 && !pending.selectedTargetIds.length) return state;
  const boardIds=new Set(state.players.flatMap(p=>p.board.flatMap(c=>c?[c.instanceId]:[])));
  return {...state,targetingState:{...pending,minTargets:1,maxTargets:1,selectedTargetIds:[],validTargetIds:pending.validTargetIds.filter(id=>boardIds.has(id)),effects:pending.effects.map(singleTarget)}};
}
