export type OnlineConnectionStatus = "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED";

export type OnlineConnectionNotice =
  | "OPPONENT_DISCONNECTED"
  | "OPPONENT_RECONNECTED"
  | "OPPONENT_FORFEITED"
  | null;

export function onlineConnectionNotice(
  previous: OnlineConnectionStatus | null,
  next: OnlineConnectionStatus,
): OnlineConnectionNotice {
  if (next === "DISCONNECTED_GRACE") {
    return previous === next ? null : "OPPONENT_DISCONNECTED";
  }
  if (next === "FORFEITED") {
    return previous === next ? null : "OPPONENT_FORFEITED";
  }
  return previous === "DISCONNECTED_GRACE" ? "OPPONENT_RECONNECTED" : null;
}