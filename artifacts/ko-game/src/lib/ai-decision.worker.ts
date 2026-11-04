import {
  chooseBestAction,
  DEFAULT_AI_DIFFICULTY,
} from "../game/actions/ai-evaluator";
import type { GameState } from "../game/types/game-state";
import type { GameAction } from "../game/actions/types";

// Pure search only. The main thread remains the sole owner of committed game state.
self.onmessage = (
  event: MessageEvent<{
    id: number;
    state: GameState;
    actions: GameAction[];
    playerId: string;
  }>,
) => {
  const { id, state, actions, playerId } = event.data;
  try {
    self.postMessage({
      id,
      action: chooseBestAction(state, actions, playerId, DEFAULT_AI_DIFFICULTY),
    });
  } catch {
    self.postMessage({ id, error: true });
  }
};
