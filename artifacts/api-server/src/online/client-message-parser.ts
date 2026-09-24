import { isOnlineActionPayload } from "./protocol";
import type { OnlineClientMessage } from "./protocol";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value: unknown, maxLength = 256): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

export function isOnlineClientMessage(value: unknown): value is OnlineClientMessage {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "JOIN_QUICK_QUEUE":
    case "CREATE_PRIVATE_ROOM":
      return isNonEmptyString(value.deckId);
    case "LEAVE_QUICK_QUEUE":
    case "LEAVE_PRIVATE_ROOM":
    case "CLOSE_PRIVATE_ROOM":
      return true;
    case "JOIN_PRIVATE_ROOM":
      return isNonEmptyString(value.roomCode) && isNonEmptyString(value.deckId);
    case "SET_ROOM_READY":
      return typeof value.ready === "boolean";
    case "SUBSCRIBE":
    case "UNSUBSCRIBE":
    case "RESYNC":
      return isNonEmptyString(value.matchId);
    case "MATCH_ACTION":
      return isNonEmptyString(value.matchId) &&
        isNonEmptyString(value.requestId, 128) &&
        Number.isInteger(value.expectedVersion) &&
        (value.expectedVersion as number) >= 0 &&
        isOnlineActionPayload(value.action);
    default:
      return false;
  }
}

export type OnlineClientMessageClassification =
  | { kind: "VALID"; message: OnlineClientMessage }
  | { kind: "INVALID_ACTION"; code: "INVALID_ACTION"; message: "액션 형식이 올바르지 않습니다." }
  | { kind: "INVALID_MESSAGE"; code: "INVALID_MESSAGE"; message: "요청 메시지 형식이 올바르지 않습니다." }
  | { kind: "UNKNOWN_MESSAGE"; code: "INVALID_MESSAGE"; message: "알 수 없는 메시지입니다." };

function isKnownClientMessageType(type: string): boolean {
  switch (type) {
    case "JOIN_QUICK_QUEUE":
    case "LEAVE_QUICK_QUEUE":
    case "CREATE_PRIVATE_ROOM":
    case "JOIN_PRIVATE_ROOM":
    case "LEAVE_PRIVATE_ROOM":
    case "CLOSE_PRIVATE_ROOM":
    case "SET_ROOM_READY":
    case "SUBSCRIBE":
    case "UNSUBSCRIBE":
    case "RESYNC":
    case "MATCH_ACTION":
      return true;
    default:
      return false;
  }
}

export function classifyOnlineClientMessage(value: unknown): OnlineClientMessageClassification {
  if (!isRecord(value) || typeof value.type !== "string") {
    return { kind: "INVALID_MESSAGE", code: "INVALID_MESSAGE", message: "요청 메시지 형식이 올바르지 않습니다." };
  }
  if (!isKnownClientMessageType(value.type)) {
    return { kind: "UNKNOWN_MESSAGE", code: "INVALID_MESSAGE", message: "알 수 없는 메시지입니다." };
  }
  if (isOnlineClientMessage(value)) return { kind: "VALID", message: value };
  if (value.type === "MATCH_ACTION" && !isOnlineActionPayload(value.action)) {
    return { kind: "INVALID_ACTION", code: "INVALID_ACTION", message: "액션 형식이 올바르지 않습니다." };
  }
  return { kind: "INVALID_MESSAGE", code: "INVALID_MESSAGE", message: "요청 메시지 형식이 올바르지 않습니다." };
}