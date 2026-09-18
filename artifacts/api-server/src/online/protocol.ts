import type { AttackTarget } from "@workspace/game-engine";
import type { BoardSlot, GameAction } from "@workspace/game-engine";

export type OnlineActionPayload =
  | { type: "PLAY_WRESTLER"; cardInstanceId: string; boardSlot: BoardSlot }
  | { type: "PLAY_TECHNIQUE"; cardInstanceId: string }
  | { type: "USE_ACTIVE"; cardInstanceId: string }
  | { type: "USE_CHAMPION_ABILITY" }
  | { type: "ATTACK"; attackerInstanceId: string; target: AttackTarget }
  | { type: "SELECT_EFFECT_TARGET"; targetId: string }
  | { type: "END_TURN" }
  | { type: "SURRENDER" };

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
  | { type: "SET_ROOM_READY"; ready: boolean };

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
    }
  | {
      type: "ACTION_ACCEPTED";
      matchId: string;
      requestId: string;
      version: number;
      state: unknown;
      events: unknown[];
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
    }
  | {
      type: "RESYNC_REQUIRED";
      matchId: string;
      version: number;
      state: unknown;
      events: unknown[];
    }
  | { type: "ERROR"; code: string; message: string }
  | LobbyServerMessage;

export type ServerGameAction = GameAction;