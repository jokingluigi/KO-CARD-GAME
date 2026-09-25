export type OnlinePresence =
  | "IDLE"
  | "QUICK_QUEUE"
  | "PRIVATE_ROOM"
  | "MATCH_STARTING"
  | "ACTIVE_MATCH";

export const lobbyPresence = new Map<string, OnlinePresence>();

export function clearActiveMatchPresenceForUsers(...userIds: Array<string | null | undefined>): void {
  for (const userId of new Set(userIds)) {
    if (userId && lobbyPresence.get(userId) === "ACTIVE_MATCH") {
      lobbyPresence.set(userId, "IDLE");
    }
  }
}