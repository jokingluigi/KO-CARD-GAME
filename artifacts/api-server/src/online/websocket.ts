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
  detachConnection,
  getRuntime,
  matchSeat,
  rejectionMessage,
  snapshotMessage,
  type OnlineMatchConnection,
  type OnlineMatchRuntime,
} from "./service";
import type { OnlineClientMessage, OnlineServerMessage } from "./protocol";

const ONLINE_WS_PATH = "/api/online-matches/ws";

function send(socket: WebSocket, message: OnlineServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function rejectUpgrade(socket: Duplex, status = "401 Unauthorized"): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function isClientMessage(value: unknown): value is OnlineClientMessage {
  return Boolean(value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string");
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
  const token = getCookieFromHeader(request.headers.cookie, AUTH_SESSION_COOKIE);
  return token ? getAuthenticatedUserFromSessionToken(token) : null;
}

async function handleConnection(socket: WebSocket, user: PublicUser): Promise<void> {
  let subscribedRuntime: OnlineMatchRuntime | null = null;
  const connection: OnlineMatchConnection = {
    userId: user.id,
    send: (message) => send(socket, message),
  };

  const detach = () => {
    if (subscribedRuntime) {
      detachConnection(subscribedRuntime, connection);
      subscribedRuntime = null;
    }
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
  connection: OnlineMatchConnection,
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

  if (parsed.type === "SUBSCRIBE") {
    const runtime = await getRuntime(parsed.matchId);
    if (!runtime || !matchSeat(runtime, connection.userId)) {
      send(socket, { type: "ERROR", code: "FORBIDDEN", message: "참가 중인 매치만 구독할 수 있습니다." });
      return;
    }
    const previous = getSubscription();
    if (previous && previous !== runtime) detachConnection(previous, connection);
    setSubscription(runtime);
    attachConnection(runtime, connection);
    send(socket, snapshotMessage(runtime, connection.userId));
    return;
  }

  if (parsed.type === "UNSUBSCRIBE") {
    const runtime = getSubscription();
    if (runtime?.matchId === parsed.matchId) {
      detachConnection(runtime, connection);
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
    const result = await applyMatchAction(
      parsed.matchId,
      connection.userId,
      parsed.requestId,
      parsed.expectedVersion,
      parsed.action,
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