import type { AttackTarget } from "../../../artifacts/ko-game/src/game/engine/combat";
import type { BoardSlot } from "../../../artifacts/ko-game/src/game/engine/board-position";

export type OnlineActionPayload =
  | { type: "PLAY_WRESTLER"; cardInstanceId: string; boardSlot: BoardSlot }
  | { type: "PLAY_TECHNIQUE"; cardInstanceId: string }
  | { type: "USE_ACTIVE"; cardInstanceId: string }
  | { type: "USE_CHAMPION_ABILITY" }
  | { type: "ATTACK"; attackerInstanceId: string; target: AttackTarget }
  | { type: "SELECT_EFFECT_TARGET"; targetId: string }
  | { type: "CANCEL_EFFECT_TARGET" }
  | {
      type: "BEGIN_TARGETED_ACTION";
      action:
        | { type: "PLAY_TECHNIQUE"; cardInstanceId: string }
        | { type: "USE_ACTIVE"; cardInstanceId: string }
        | { type: "USE_CHAMPION_ABILITY" };
    }
  | { type: "CONFIRM_PRECOMMIT_TARGET"; targetId: string }
  | { type: "END_TURN" }
  | { type: "SURRENDER" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}

function isTarget(value: unknown): value is AttackTarget {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "PLAYER") {
    return hasExactKeys(value, ["type", "playerId"]) && isNonEmptyString(value.playerId);
  }
  return value.type === "WRESTLER" &&
    hasExactKeys(value, ["type", "playerId", "cardInstanceId"]) &&
    isNonEmptyString(value.playerId) &&
    isNonEmptyString(value.cardInstanceId);
}

function isNestedTargetedAction(value: unknown): value is Extract<OnlineActionPayload, { type: "BEGIN_TARGETED_ACTION" }>["action"] {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "USE_CHAMPION_ABILITY") {
    return hasExactKeys(value, ["type"]);
  }
  return (value.type === "PLAY_TECHNIQUE" || value.type === "USE_ACTIVE") &&
    hasExactKeys(value, ["type", "cardInstanceId"]) &&
    isNonEmptyString(value.cardInstanceId);
}

export function isOnlineActionPayload(value: unknown): value is OnlineActionPayload {
  if (!isRecord(value) || typeof value.type !== "string") return false;

  switch (value.type) {
    case "PLAY_WRESTLER":
      return hasExactKeys(value, ["type", "cardInstanceId", "boardSlot"]) &&
        isNonEmptyString(value.cardInstanceId) &&
        (value.boardSlot === 0 || value.boardSlot === 1 || value.boardSlot === 2 || value.boardSlot === 3);
    case "PLAY_TECHNIQUE":
    case "USE_ACTIVE":
      return hasExactKeys(value, ["type", "cardInstanceId"]) && isNonEmptyString(value.cardInstanceId);
    case "USE_CHAMPION_ABILITY":
    case "END_TURN":
    case "SURRENDER":
    case "CANCEL_EFFECT_TARGET":
      return hasExactKeys(value, ["type"]);
    case "SELECT_EFFECT_TARGET":
    case "CONFIRM_PRECOMMIT_TARGET":
      return hasExactKeys(value, ["type", "targetId"]) && isNonEmptyString(value.targetId);
    case "ATTACK":
      return hasExactKeys(value, ["type", "attackerInstanceId", "target"]) &&
        isNonEmptyString(value.attackerInstanceId) &&
        isTarget(value.target);
    case "BEGIN_TARGETED_ACTION":
      return hasExactKeys(value, ["type", "action"]) && isNestedTargetedAction(value.action);
    default:
      return false;
  }
}