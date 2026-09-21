import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import {
  AUTH_SESSION_COOKIE,
  getAuthenticatedUserFromSessionToken,
  getCookieFromHeader,
  type PublicUser,
} from "../lib/auth";
import {
  applyMatchAction,
  attachConnection,
  broadcastExecution,
  isPrimaryConnection,
  markConnectionDisconnected,
  getRuntime,
  matchSeat,
  rejectionMessage,
  snapshotMessage,
  type OnlineMatchConnection,
  type OnlineMatchRuntime,
} from "./service";
import {
  createPrivateRoom,
  detachLobbyConnection,
  joinPrivateRoom,
  joinQuickQueue,
  leavePrivateRoom,
  leaveQuickQueue,
  setPrivateRoomReady,
} from "./lobby";
import { getUserFromWebSocketAuthTicket } from "./websocket-auth";
import type { OnlineActionPayload, OnlineClientMessage, OnlineServerMessage } from "./protocol";

const ONLINE_WS_PATH = "/api/online-matches/ws";

function send(socket: WebSocket, message: OnlineServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function rejectUpgrade(socket: Duplex, status = "401 Unauthorized"): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value: unknown, maxLength = 256): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isOnlineActionPayload(value: unknown): value is OnlineActionPayload {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "PLAY_WRESTLER":
      return isNonEmptyString(value.cardInstanceId) &&
        (value.boardSlot === 0 || value.boardSlot === 1 || value.boardSlot === 2 || value.boardSlot === 3);
    case "PLAY_TECHNIQUE":
    case "USE_ACTIVE":
      return isNonEmptyString(value.cardInstanceId);
    case "USE_CHAMPION_ABILITY":
    case "END_TURN":
    case "SURRENDER":
      return true;
    case "SELECT_EFFECT_TARGET":
      return isNonEmptyString(value.targetId);
    case "ATTACK": {
      if (!isNonEmptyString(value.attackerInstanceId) || !isRecord(value.target)) return false;
      if (value.target.type === "PLAYER") return isNonEmptyString(value.target.playerId);
      return value.target.type === "WRESTLER" &&
        isNonEmptyString(value.target.playerId) &&
        isNonEmptyString(value.target.cardInstanceId);
    }
    default:
      return false;
  }
}

function isClientMessage(value: unknown): value is OnlineClientMessage {
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

export function attachOnlineMatchWebSocket(server: HttpServer): void {
  const webSockets = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (url.pathname !== ONLINE_WS_PATH) return;

    void authenticateUpgrade(request).then((user) => {
      if (!user) {
        rejectUpgrade(socket);
        return;
      }
      webSockets.handleUpgrade(request, socket, head, (webSocket) => {
        void handleConnection(webSocket, user);
      });
    }).catch(() => rejectUpgrade(socket, "500 Internal Server Error"));
  });
}

async function authenticateUpgrade(request: IncomingMessage): Promise<PublicUser | null> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const ticket = url.searchParams.get("ticket");
  if (ticket) {
    const user = await getUserFromWebSocketAuthTicket(ticket);
    if (user) return user;
  }

  const token = getCookieFromHeader(request.headers.cookie, AUTH_SESSION_COOKIE);
  return token ? getAuthenticatedUserFromSessionToken(token) : null;
}

async function handleConnection(socket: WebSocket, user: PublicUser): Promise<void> {
  let subscribedRuntime: OnlineMatchRuntime | null = null;
  const connection = {
    userId: user.id,
    nickname: user.nickname,
    send: (message) => send(socket, message),
  } satisfies OnlineMatchConnection & { nickname: string };

  const detach = () => {
    if (subscribedRuntime) {
      const runtime = subscribedRuntime;
      void markConnectionDisconnected(runtime, connection);
      subscribedRuntime = null;
    }
    void detachLobbyConnection(connection);
  };

  socket.on("close", detach);
  socket.on("error", detach);
  socket.on("message", (raw) => {
    void handleMessage(raw.toString(), socket, connection, () => subscribedRuntime, (runtime) => {
      subscribedRuntime = runtime;
    });
  });
}

async function handleMessage(
  raw: string,
  socket: WebSocket,
  connection: OnlineMatchConnection & { nickname: string },
  getSubscription: () => OnlineMatchRuntime | null,
  setSubscription: (runtime: OnlineMatchRuntime | null) => void,
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    send(socket, { type: "ERROR", code: "INVALID_JSON", message: "JSON 메시지를 확인해 주세요." });
    return;
  }
  if (!isClientMessage(parsed)) {
    send(socket, { type: "ERROR", code: "INVALID_MESSAGE", message: "알 수 없는 메시지입니다." });
    return;
  }

  if (parsed.type === "JOIN_QUICK_QUEUE") {
    await joinQuickQueue(connection, parsed.deckId);
    return;
  }
  if (parsed.type === "LEAVE_QUICK_QUEUE") {
    await leaveQuickQueue(connection);
    return;
  }
  if (parsed.type === "CREATE_PRIVATE_ROOM") {
    await createPrivateRoom(connection, parsed.deckId);
    return;
  }
  if (parsed.type === "JOIN_PRIVATE_ROOM") {
    await joinPrivateRoom(connection, parsed.roomCode, parsed.deckId);
    return;
  }
  if (parsed.type === "LEAVE_PRIVATE_ROOM") {
    await leavePrivateRoom(connection);
    return;
  }
  if (parsed.type === "CLOSE_PRIVATE_ROOM") {
    await leavePrivateRoom(connection, true);
    return;
  }
  if (parsed.type === "SET_ROOM_READY") {
    await setPrivateRoomReady(connection, parsed.ready);
    return;
  }

  if (parsed.type === "SUBSCRIBE") {
    const runtime = await getRuntime(parsed.matchId);
    if (!runtime || !matchSeat(runtime, connection.userId)) {
      send(socket, { type: "ERROR", code: "FORBIDDEN", message: "참가 중인 매치만 구독할 수 있습니다." });
      return;
    }
    const previous = getSubscription();
    if (previous && previous !== runtime) {
      void markConnectionDisconnected(previous, connection);
    }
    setSubscription(runtime);
    attachConnection(runtime, connection);
    send(socket, snapshotMessage(runtime, connection.userId));
    return;
  }

  if (parsed.type === "RESYNC") {
    const runtime = await getRuntime(parsed.matchId);
    if (!runtime || !matchSeat(runtime, connection.userId)) {
      send(socket, { type: "ERROR", code: "FORBIDDEN", message: "참가 중인 매치만 동기화할 수 있습니다." });
      return;
    }
    const previous = getSubscription();
    if (previous && previous !== runtime) void markConnectionDisconnected(previous, connection);
    setSubscription(runtime);
    attachConnection(runtime, connection);
    const snapshot = snapshotMessage(runtime, connection.userId);
    if (snapshot.type !== "MATCH_SNAPSHOT") return;
    send(socket, { ...snapshot, type: "RESYNC_REQUIRED" });
    return;
  }

  if (parsed.type === "UNSUBSCRIBE") {
    const runtime = getSubscription();
    if (runtime?.matchId === parsed.matchId) {
      void markConnectionDisconnected(runtime, connection);
      setSubscription(null);
    }
    return;
  }

  const runtime = getSubscription();
  if (!runtime || runtime.matchId !== parsed.matchId) {
    send(socket, { type: "ERROR", code: "NOT_SUBSCRIBED", message: "먼저 매치를 구독해야 합니다." });
    return;
  }

  try {
    if (!isPrimaryConnection(runtime, connection)) {
      send(socket, {
        type: "ACTION_REJECTED",
        matchId: runtime.matchId,
        requestId: parsed.requestId,
        code: "NOT_PRIMARY_CONNECTION",
        message: "다른 창에서 이 대전에 접속했습니다.",
        currentVersion: runtime.version,
      });
      return;
    }
    const result = await applyMatchAction(
      parsed.matchId,
      connection.userId,
      parsed.requestId,
      parsed.expectedVersion,
      parsed.action,
      connection,
    );
    if (!result.ok) {
      send(socket, rejectionMessage(result));
      return;
    }

    broadcastExecution(result);
    if (runtime.state.status === "FINISHED") {
      setSubscription(null);
    }
  } catch (error) {
    send(socket, {
      type: "ERROR",
      code: "MATCH_ACTION_FAILED",
      message: error instanceof Error ? error.message : "매치 action을 처리하지 못했습니다.",
    });
  }
}