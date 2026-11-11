import type { CardInstance } from "../cards/types";
import { getActiveCardAbilities } from "../cards/granted-text";
import type { EventAttribution, GameEvent } from "../events/types";
import type { GameState } from "../types/game-state";

const PANDORA_CHAMPION_ID = "bcffab96-f61f-497e-b60b-de5a869837d3";

/** Snapshot effect eligibility at damage application, before reactions change its source. */
export function effectCanPinfall(
  source: CardInstance,
  context?: EventAttribution,
): boolean {
  // A child card effect may inherit its parent's attribution. Only the actual
  // ability proxy qualifies as Pandora's ability, never another card in that chain.
  if (
    context?.sourceActionType === "USE_CHAMPION_ABILITY" &&
    context.sourceChampionDefinitionId === PANDORA_CHAMPION_ID &&
    context.sourceChampionInstanceId === source.instanceId
  )
    return true;
  return (
    !source.isAbilityDisabled &&
    getActiveCardAbilities(source).some(
      (ability) => ability.trigger === "EXACT_ZERO_DAMAGE",
    )
  );
}

export function damageCanPinfall(state: GameState, damage: GameEvent): boolean {
  if (
    damage.type !== "DAMAGE_DEALT" ||
    damage.target?.type !== "CARD" ||
    damage.source?.type !== "CARD"
  )
    return false;
  const sourceId = damage.source.cardInstanceId;
  const source = state.players
    .flatMap((player) => [
      ...player.board,
      ...player.hand,
      ...player.deck,
      ...player.graveyard,
      ...player.removedFromGame,
    ])
    .find((card) => card?.instanceId === sourceId);
  // COMBAT is emitted only for the physical hit, separately from attack-triggered effects.
  if (damage.reason === "COMBAT")
    return Boolean(source && (source.cardType ?? "WRESTLER") === "WRESTLER");
  if (damage.reason !== "CARD_EFFECT") return false;
  if (damage.pinfallEligible !== undefined) return damage.pinfallEligible;
  // Compatibility for unfinished damage chains saved before the explicit snapshot.
  return Boolean(source && effectCanPinfall(source, damage.sourceContext));
}
