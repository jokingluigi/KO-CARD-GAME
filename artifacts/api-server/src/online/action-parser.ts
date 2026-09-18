import type { GameAction } from "@workspace/game-engine";
import type { OnlineActionPayload } from "./protocol";

export function toServerAction(
  payload: unknown,
  playerId: string,
): GameAction | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const action = payload as Partial<OnlineActionPayload>;
  if (typeof action.type !== "string") return null;

  switch (action.type) {
    case "PLAY_WRESTLER":
      return typeof action.cardInstanceId === "string" &&
        (action.boardSlot === 0 || action.boardSlot === 1 || action.boardSlot === 2 || action.boardSlot === 3)
        ? { type: action.type, playerId, cardInstanceId: action.cardInstanceId, boardSlot: action.boardSlot }
        : null;
    case "PLAY_TECHNIQUE":
      return typeof action.cardInstanceId === "string"
        ? { type: action.type, playerId, cardInstanceId: action.cardInstanceId }
        : null;
    case "USE_ACTIVE":
      return typeof action.cardInstanceId === "string"
        ? { type: action.type, playerId, cardInstanceId: action.cardInstanceId }
        : null;
    case "USE_CHAMPION_ABILITY":
      return { type: action.type, playerId };
    case "ATTACK": {
      if (typeof action.attackerInstanceId !== "string" || !action.target || typeof action.target !== "object") return null;
      const target = action.target;
      if (target.type === "PLAYER" && typeof target.playerId === "string") {
        return { type: action.type, playerId, attackerInstanceId: action.attackerInstanceId, target };
      }
      if (target.type === "WRESTLER" && typeof target.playerId === "string" && typeof target.cardInstanceId === "string") {
        return { type: action.type, playerId, attackerInstanceId: action.attackerInstanceId, target };
      }
      return null;
    }
    case "SELECT_EFFECT_TARGET":
      return typeof action.targetId === "string"
        ? { type: action.type, playerId, targetId: action.targetId }
        : null;
    case "END_TURN":
      return { type: action.type, playerId };
    case "SURRENDER":
      return { type: action.type, playerId };
    default:
      return null;
  }
}