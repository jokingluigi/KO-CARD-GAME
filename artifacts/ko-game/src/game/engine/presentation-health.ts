import type { PlayerState } from "../types/game-state";
/** Presentation-only cumulative counter. Does not dispatch game/quest events. */
export function presentationHealingAfter(
  player: PlayerState,
  before: number,
  after: number,
) {
  return after > before
    ? {
        sequence: (player.presentationHealing?.sequence ?? 0) + 1,
        total: (player.presentationHealing?.total ?? 0) + after - before,
      }
    : player.presentationHealing;
}
