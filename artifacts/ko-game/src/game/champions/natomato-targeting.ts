import type { ChampionAbility, ChampionEffect } from "./types";
import type { CardEffect } from "../effects/types";
import type { GameState } from "../types/game-state";
export function isNatomatoDodge(effect: CardEffect | ChampionEffect): boolean {
  return (
    effect.type === "STRUCTURED" &&
    effect.values?.balance?.operation === "GRANT_DODGE_ONCE"
  );
}
export function singleTargetNatomatoEffect<
  T extends CardEffect | ChampionEffect,
>(effect: T): T {
  if (!isNatomatoDodge(effect) || effect.type !== "STRUCTURED") return effect;
  return {
    ...effect,
    target: {
      zone: "BOARD",
      owner: "SELF",
      cardType: "WRESTLER",
      selection: "PLAYER_CHOICE",
      count: 1,
      minTargets: 1,
      maxTargets: 1,
    },
  } as T;
}
/** Also applies to a definition captured in an existing battle, without resetting use counters. */
export function singleTargetNatomatoAbility(
  ability: ChampionAbility,
): ChampionAbility {
  if (!ability.effects.some(isNatomatoDodge)) return ability;
  return {
    ...ability,
    description: ability.description.replace(
      "필드에 있는 아군 선수 카드에게",
      "선택한 아군 선수 카드 1장에게",
    ),
    effects: ability.effects.map(singleTargetNatomatoEffect),
  };
}
export function normalizeNatomatoTargeting(state: GameState): GameState {
  const pending = state.targetingState,
    effect = pending?.effects[pending.effectIndex];
  if (!pending || !effect || !isNatomatoDodge(effect)) return state;
  const valid = new Set(
    state.players
      .find((p) => p.id === pending.playerId)
      ?.board.flatMap((c) =>
        c && !c.championDodgeGranted ? [c.instanceId] : [],
      ) ?? [],
  );
  if (
    effect.type === "STRUCTURED" &&
    effect.target?.selection === "PLAYER_CHOICE" &&
    effect.target?.count === 1 &&
    pending.minTargets === 1 &&
    pending.maxTargets === 1 &&
    pending.validTargetIds.every((id) => valid.has(id))
  )
    return state;
  return {
    ...state,
    targetingState: {
      ...pending,
      effects: pending.effects.map(singleTargetNatomatoEffect),
      minTargets: 1,
      maxTargets: 1,
      selectedTargetIds: [],
      validTargetIds: pending.validTargetIds.filter((id) => valid.has(id)),
    },
  };
}
