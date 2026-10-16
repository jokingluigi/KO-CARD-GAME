import { executeAction, type GameState } from "@workspace/game-engine";
type Action = Parameters<typeof executeAction>[1];
type ObservedState = GameState & {
  usageObservation?: { cancelled: number[]; pendingCommit?: number };
};
/** Server-only observer. Does not alter costs, targeting, events, rewards or combat rules. */
export function executeUsageObservedAction(
  state: GameState,
  action: Action,
): ReturnType<typeof executeAction> {
  const result = executeAction(state, action);
  if (!result.success) return result;
  const previous = (state as ObservedState).usageObservation;
  let pending = previous?.pendingCommit;
  let cancelled = previous?.cancelled ?? [];
  if (
    action.type === "CANCEL_EFFECT_TARGET" &&
    pending !== undefined &&
    result.state !== state &&
    result.state.targetingState !== state.targetingState &&
    result.state.events[pending] === state.events[pending]
  ) {
    cancelled = [...new Set([...cancelled, pending])];
    pending = undefined;
  }
  for (let i = state.events.length; i < result.state.events.length; i++) {
    const e = result.state.events[i]!;
    if (e.type === "CARD_PLAYED" || e.type === "CHAMPION_ABILITY_USED")
      pending = i;
  }
  if (!result.state.targetingState?.active) pending = undefined;
  if (!previous && !cancelled.length && pending === undefined) return result;
  return {
    ...result,
    state: {
      ...result.state,
      usageObservation: { cancelled, pendingCommit: pending },
    } as ObservedState,
  };
}
export function cancelledUsageEvents(state: GameState): ReadonlySet<number> {
  return new Set((state as ObservedState).usageObservation?.cancelled ?? []);
}
