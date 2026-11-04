import {
  aiInformationState,
  chooseBestAction,
  DEFAULT_AI_DIFFICULTY,
} from "../game/actions/ai-evaluator";
import type { GameState } from "../game/types/game-state";
import type { GameAction } from "../game/actions/types";

/** One worker per AI turn; disposal releases the snapshot and pending work on navigation/restart. */
export function createAIDecisionClient() {
  let worker: Worker | null = null,
    sequence = 0,
    disposed = false;
  const pending = new Map<
    number,
    { resolve: (action: GameAction) => void; fallback: () => GameAction }
  >();
  try {
    if (typeof Worker !== "undefined")
      worker = new Worker(new URL("./ai-decision.worker.ts", import.meta.url), {
        type: "module",
      });
  } catch {
    /* Older browsers keep the bounded synchronous path. */
  }
  const fail = () => {
    worker?.terminate();
    worker = null;
    for (const p of pending.values()) p.resolve(p.fallback());
    pending.clear();
  };
  if (worker) {
    worker.onerror = fail;
    worker.onmessage = (
      event: MessageEvent<{ id: number; action?: GameAction; error?: boolean }>,
    ) => {
      const job = pending.get(event.data.id);
      if (!job) return;
      pending.delete(event.data.id);
      job.resolve(event.data.action ?? job.fallback());
    };
  }
  return {
    choose(
      state: GameState,
      actions: GameAction[],
      playerId: string,
    ): Promise<GameAction> {
      if (disposed) return Promise.resolve({ type: "END_TURN", playerId });
      const visible = aiInformationState(state, playerId);
      const fallback = () =>
        chooseBestAction(visible, actions, playerId, DEFAULT_AI_DIFFICULTY);
      if (!worker) return Promise.resolve(fallback());
      const id = ++sequence;
      return new Promise((resolve) => {
        pending.set(id, { resolve, fallback });
        try {
          worker!.postMessage({ id, state: visible, actions, playerId });
        } catch {
          fail();
        }
      });
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      worker = null;
      for (const p of pending.values())
        p.resolve({ type: "END_TURN", playerId: "" });
      pending.clear();
    },
  };
}
