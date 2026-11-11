import type { GameState } from "../types/game-state";

/** A committed free finisher keeps its mandatory choices across nested frames. */
export function hasPendingFinisherCast(state: GameState): boolean {
  for (let frame = state.targetingState; frame; frame = frame.continuation)
    if (frame.finisherAutoCast) return true;
  return false;
}

/** A committed automatic payment must survive timeouts, reconnects and nested effects. */
export function hasPendingProgram(state: GameState): boolean {
  for (let frame = state.targetingState; frame; frame = frame.continuation)
    if (frame.programPaid) return true;
  return false;
}
