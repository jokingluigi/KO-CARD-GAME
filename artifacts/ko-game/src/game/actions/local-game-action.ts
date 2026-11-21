import { executeAction } from "./engine-actions";
import type { GameAction } from "./types";
import type { GameState } from "../types/game-state";

/** React renders can lag behind input callbacks. Commit against the canonical ref
 * immediately, before another input can accept the same stale field snapshot.
 * Only successful results may be appended to the caller's action transcript. */
export function dispatchLocalGameAction(
  state: { current: GameState },
  action: GameAction,
) {
  const result = executeAction(state.current, action);
  if (result.success) state.current = result.state;
  return result;
}
