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
import type { OnlineClientMessage, OnlineServerMessage } from "./protocol";
import { classifyOnlineClientMessage } from "./client-message-parser";

const ONLINE_WS_PATH = "/api/online-matches/ws";

function send(socket: WebSocket, message: OnlineServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function rejectUpgrade(socket: Duplex, status = "401 Unauthorized"): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
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
  const classification = classifyOnlineClientMessage(parsed);
  if (classification.kind !== "VALID") {
    send(socket, {
      type: "ERROR",
      code: classification.code,
      message: classification.message,
    });
    return;
  }
  const message: OnlineClientMessage = classification.message;

  if (message.type === "JOIN_QUICK_QUEUE") {
    await joinQuickQueue(connection, message.deckId);
    return;
  }
  if (message.type === "LEAVE_QUICK_QUEUE") {
    await leaveQuickQueue(connection);
    return;
  }
  if (message.type === "CREATE_PRIVATE_ROOM") {
    await createPrivateRoom(connection, message.deckId);
    return;
  }
  if (message.type === "JOIN_PRIVATE_ROOM") {
    await joinPrivateRoom(connection, message.roomCode, message.deckId);
    return;
  }
  if (message.type === "LEAVE_PRIVATE_ROOM") {
    await leavePrivateRoom(connection);
    return;
  }
  if (message.type === "CLOSE_PRIVATE_ROOM") {
    await leavePrivateRoom(connection, true);
    return;
  }
  if (message.type === "SET_ROOM_READY") {
    await setPrivateRoomReady(connection, message.ready);
    return;
  }

  if (message.type === "SUBSCRIBE") {
    const runtime = await getRuntime(message.matchId);
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

  if (message.type === "RESYNC") {
    const runtime = await getRuntime(message.matchId);
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

  if (message.type === "UNSUBSCRIBE") {
    const runtime = getSubscription();
    if (runtime?.matchId === message.matchId) {
      void markConnectionDisconnected(runtime, connection);
      setSubscription(null);
    }
    return;
  }

  const runtime = getSubscription();
  if (!runtime || runtime.matchId !== message.matchId) {
    send(socket, { type: "ERROR", code: "NOT_SUBSCRIBED", message: "먼저 매치를 구독해야 합니다." });
    return;
  }

  try {
    if (!isPrimaryConnection(runtime, connection)) {
      send(socket, {
        type: "ACTION_REJECTED",
        matchId: runtime.matchId,
        requestId: message.requestId,
        code: "NOT_PRIMARY_CONNECTION",
        message: "다른 창에서 이 대전에 접속했습니다.",
        currentVersion: runtime.version,
      });
      return;
    }
    const result = await applyMatchAction(
      message.matchId,
      connection.userId,
      message.requestId,
      message.expectedVersion,
      message.action,
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