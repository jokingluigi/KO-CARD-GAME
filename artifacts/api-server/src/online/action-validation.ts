import type { GameAction, GameState } from "@workspace/game-engine";

export function directActionStartsTargeting(action: GameAction, candidateState: GameState): boolean {
  return (
    action.type === "PLAY_TECHNIQUE" ||
    action.type === "USE_ACTIVE" ||
    action.type === "USE_CHAMPION_ABILITY"
  ) && candidateState.targetingState?.active === true;
}

export function rejectedActionCode(
  action: GameAction,
  state: GameState,
  legalActions: GameAction[],
  playerId: string,
): "INVALID_ACTION" | "INVALID_TARGET" {
  const targeting = state.targetingState;
  if (
    action.type === "SELECT_EFFECT_TARGET" &&
    targeting?.active &&
    targeting.playerId === playerId &&
    targeting.phase !== "PRE_COMMIT"
  ) {
    return "INVALID_TARGET";
  }
  if (
    action.type === "CONFIRM_PRECOMMIT_TARGET" &&
    targeting?.active &&
    targeting.playerId === playerId &&
    targeting.phase === "PRE_COMMIT"
  ) {
    return "INVALID_TARGET";
  }
  if (
    action.type === "ATTACK" &&
    legalActions.some((candidate) =>
      candidate.type === "ATTACK" && candidate.attackerInstanceId === action.attackerInstanceId
    )
  ) {
    return "INVALID_TARGET";
  }
  return "INVALID_ACTION";
}