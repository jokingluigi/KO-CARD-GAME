import {
  resolveRegisteredRuleListeners,
  resolveTriggeredAbilities,
} from "../effects/effect-engine";
import type { GameState } from "../types/game-state";
import type { CardInstance } from "../cards/types";
/** Common spell listeners and authored effects after the card has been committed. */
export function resolveCommittedTechnique(
  state: GameState,
  playerId: string,
  card: CardInstance,
  playedFromHand: boolean,
): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const body = card.abilities
    .filter((a) => a.trigger === "ACTIVE" || a.trigger === "ENTER_FIELD")
    .flatMap((a) => a.effects);
  // Technique-cast abilities are resolved before the technique's own effects.
  const listenerResolved = resolveRegisteredRuleListeners(
    state,
    "TECHNIQUE_PLAYED",
    playerId,
    card.instanceId,
    "TECHNIQUE",
  );
  const spellListeners =
    (card.baseCost ?? card.currentCost) >= 1
      ? player.board
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
          .reduce(
            (next, source) =>
              resolveTriggeredAbilities(
                next,
                playerId,
                source,
                "TECHNIQUE_CAST",
                {
                  playedFromHand,
                  baseCost: card.baseCost ?? card.currentCost,
                },
              ),
            listenerResolved,
          )
      : listenerResolved;
  const resolved = body.length
    ? resolveTriggeredAbilities(
        spellListeners,
        playerId,
        { ...card, abilities: [{ trigger: "ACTIVE", effects: body }] },
        "ACTIVE",
      )
    : spellListeners;
  return resolved;
}
