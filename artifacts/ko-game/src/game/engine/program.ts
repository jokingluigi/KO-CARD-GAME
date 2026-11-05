import type { GameState } from "../types/game-state";

/** A committed automatic payment must survive timeouts, reconnects and nested effects. */
export function hasPendingProgram(state: GameState): boolean {
  for (let frame = state.targetingState; frame; frame = frame.continuation)
    if (frame.programPaid) return true;
  return false;
}
