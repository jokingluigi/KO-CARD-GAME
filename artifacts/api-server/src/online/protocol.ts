import type { GameAction } from "@workspace/game-engine";
import { isOnlineActionPayload } from "@workspace/game-engine/online-action";
import type { OnlineActionPayload } from "@workspace/game-engine/online-action";

export { isOnlineActionPayload };
export type { OnlineActionPayload };

export type OnlineClientMessage =
  | { type: "SUBSCRIBE"; matchId: string }
  | { type: "UNSUBSCRIBE"; matchId: string }
  | {
      type: "MATCH_ACTION";
      matchId: string;
      requestId: string;
      expectedVersion: number;
      action: OnlineActionPayload;
    }
  | { type: "JOIN_QUICK_QUEUE"; deckId: string }
  | { type: "LEAVE_QUICK_QUEUE" }
  | { type: "CREATE_PRIVATE_ROOM"; deckId: string }
  | { type: "JOIN_PRIVATE_ROOM"; roomCode: string; deckId: string }
  | { type: "LEAVE_PRIVATE_ROOM" }
  | { type: "CLOSE_PRIVATE_ROOM" }
  | { type: "SET_ROOM_READY"; ready: boolean }
  | { type: "RESYNC"; matchId: string };

export type LobbyDeckSummary = {
  deckId: string;
  deckName: string;
  championName: string | null;
};

export type LobbyRoomMember = LobbyDeckSummary & {
  userId: string;
  nickname: string;
  ready: boolean;
};

export type LobbyRoomState = {
  roomId: string;
  roomCode: string;
  host: LobbyRoomMember;
  guest: LobbyRoomMember | null;
  youAreHost: boolean;
};

export type LobbyOpponent = {
  nickname: string;
  championName: string | null;
  deckName: string;
};

export type OnlinePublicPlayerMetadata = {
  seat: "PLAYER_ONE" | "PLAYER_TWO";
  displayName: string;
  championDefinitionId: string;
  championName: string;
  portraitUrl: string | null;
  dialogueLine: string | null;
};

export type LobbyServerMessage =
  | { type: "QUICK_QUEUE_JOINED"; deck: LobbyDeckSummary }
  | { type: "QUICK_QUEUE_LEFT"; reason?: string }
  | { type: "MATCH_FOUND"; matchId: string; opponent: LobbyOpponent }
  | { type: "PRIVATE_ROOM_CREATED"; room: LobbyRoomState }
  | { type: "PRIVATE_ROOM_JOINED"; room: LobbyRoomState }
  | { type: "PRIVATE_ROOM_UPDATED"; room: LobbyRoomState }
  | { type: "PRIVATE_ROOM_LEFT" }
  | { type: "PRIVATE_ROOM_CLOSED" }
  | { type: "MATCH_STARTING"; matchId: string; opponent: LobbyOpponent }
  | { type: "LOBBY_ERROR"; code: string; message: string };

export type OnlineServerMessage =
  | {
      type: "MATCH_SNAPSHOT";
      matchId: string;
      seat: "PLAYER_ONE" | "PLAYER_TWO";
      version: number;
      state: unknown;
      events: unknown[];
      serverTime: number;
      turnStartedAt: number | null;
      turnDeadlineAt: number | null;
       gameplayStartsAt: number | null;
       publicPlayers: OnlinePublicPlayerMetadata[];
       introFirstSpeaker: "PLAYER_ONE" | "PLAYER_TWO" | null;
      connectionStates: Record<"PLAYER_ONE" | "PLAYER_TWO", "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED">;
    }
  | {
      type: "ACTION_ACCEPTED";
      matchId: string;
      requestId: string;
      version: number;
      state: unknown;
      events: unknown[];
      serverTime: number;
      turnStartedAt: number | null;
      turnDeadlineAt: number | null;
       gameplayStartsAt: number | null;
       publicPlayers: OnlinePublicPlayerMetadata[];
       introFirstSpeaker: "PLAYER_ONE" | "PLAYER_TWO" | null;
      connectionStates: Record<"PLAYER_ONE" | "PLAYER_TWO", "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED">;
    }
  | {
      type: "ACTION_REJECTED";
      matchId: string;
      requestId?: string;
      code: string;
      message: string;
      currentVersion: number;
    }
  | {
      type: "MATCH_ENDED";
      matchId: string;
      version: number;
      state: unknown;
      events: unknown[];
      serverTime: number;
      turnStartedAt: number | null;
      turnDeadlineAt: number | null;
       gameplayStartsAt: number | null;
       publicPlayers: OnlinePublicPlayerMetadata[];
       introFirstSpeaker: "PLAYER_ONE" | "PLAYER_TWO" | null;
      connectionStates: Record<"PLAYER_ONE" | "PLAYER_TWO", "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED">;
    }
  | {
      type: "RESYNC_REQUIRED";
      matchId: string;
      version: number;
      state: unknown;
      events: unknown[];
      serverTime: number;
      turnStartedAt: number | null;
      turnDeadlineAt: number | null;
       gameplayStartsAt: number | null;
       publicPlayers: OnlinePublicPlayerMetadata[];
       introFirstSpeaker: "PLAYER_ONE" | "PLAYER_TWO" | null;
      connectionStates: Record<"PLAYER_ONE" | "PLAYER_TWO", "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED">;
    }
  | {
      type: "MATCH_CONNECTION_STATUS";
      matchId: string;
      playerId: "PLAYER_ONE" | "PLAYER_TWO";
      status: "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED";
      reconnectDeadlineAt: number | null;
      serverTime: number;
    }
  | { type: "SESSION_REPLACED"; matchId: string; message: string }
  | { type: "ERROR"; code: string; message: string }
  | LobbyServerMessage;

export type ServerGameAction = GameAction;