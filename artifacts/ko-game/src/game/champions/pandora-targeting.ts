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
  const pending=state.targetingState;
  if (!pending || !pending.effects[pending.effectIndex] || !isPandoraDamage(pending.effects[pending.effectIndex])) return state;
  if (pending.minTargets===1 && pending.maxTargets===1 && !pending.selectedTargetIds.length) return state;
  const boardIds=new Set(state.players.flatMap(p=>p.board.flatMap(c=>c?[c.instanceId]:[])));
  return {...state,targetingState:{...pending,minTargets:1,maxTargets:1,selectedTargetIds:[],validTargetIds:pending.validTargetIds.filter(id=>boardIds.has(id)),effects:pending.effects.map(singleTarget)}};
}
