import type { OnlineActionPayload } from "./online-match-protocol";

export type LobbyDeckSummary = {
  deckId: string;
  deckName: string;
  championName: string | null;
};

export type LobbyOpponentSummary = {
  nickname: string;
  championName: string | null;
  deckName: string;
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

export type OnlineLobbyMessage =
  | { type: "QUICK_QUEUE_JOINED"; deck: LobbyDeckSummary }
  | { type: "QUICK_QUEUE_LEFT"; reason?: string }
  | { type: "MATCH_FOUND"; matchId: string; opponent?: LobbyOpponentSummary }
  | { type: "PRIVATE_ROOM_CREATED"; room: LobbyRoomState }
  | { type: "PRIVATE_ROOM_JOINED"; room: LobbyRoomState }
  | { type: "PRIVATE_ROOM_UPDATED"; room: LobbyRoomState }
  | { type: "PRIVATE_ROOM_LEFT"; roomId?: string; message?: string }
  | { type: "PRIVATE_ROOM_CLOSED"; roomId?: string; message?: string }
  | { type: "MATCH_STARTING"; matchId: string; opponent?: LobbyOpponentSummary }
  | { type: "LOBBY_ERROR"; code: string; message: string }
  | { type: "ERROR"; code: string; message: string };

export type OnlineMatchMessage =
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
      connectionStates: Record<
        "PLAYER_ONE" | "PLAYER_TWO",
        "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED"
      >;
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
      connectionStates: Record<
        "PLAYER_ONE" | "PLAYER_TWO",
        "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED"
      >;
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
      connectionStates: Record<
        "PLAYER_ONE" | "PLAYER_TWO",
        "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED"
      >;
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
      connectionStates: Record<
        "PLAYER_ONE" | "PLAYER_TWO",
        "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED"
      >;
    }
  | {
      type: "MATCH_CONNECTION_STATUS";
      matchId: string;
      playerId: "PLAYER_ONE" | "PLAYER_TWO";
      status: "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED";
      reconnectDeadlineAt: number | null;
      serverTime: number;
    }
  | { type: "SESSION_REPLACED"; matchId: string; message: string };

export type OnlineServerMessage = OnlineLobbyMessage | OnlineMatchMessage;

export type OnlineLobbyClientMessage =
  | { type: "JOIN_QUICK_QUEUE"; deckId: string }
  | { type: "LEAVE_QUICK_QUEUE" }
  | { type: "CREATE_PRIVATE_ROOM"; deckId: string }
  | { type: "JOIN_PRIVATE_ROOM"; roomCode: string; deckId: string }
  | { type: "LEAVE_PRIVATE_ROOM"; roomId: string }
  | { type: "CLOSE_PRIVATE_ROOM"; roomId: string }
  | { type: "SET_ROOM_READY"; roomId: string; ready: boolean }
  | { type: "SUBSCRIBE"; matchId: string }
  | { type: "UNSUBSCRIBE"; matchId: string }
  | { type: "RESYNC"; matchId: string }
  | {
      type: "MATCH_ACTION";
      matchId: string;
      requestId: string;
      expectedVersion: number;
      action: OnlineActionPayload;
    };

export type OnlineLobbyConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";
export type OnlineLobbyListener = (message: OnlineServerMessage) => void;
export type OnlineLobbyConnectionListener = (
  state: OnlineLobbyConnectionState,
) => void;

const WS_PATH = "/api/online-matches/ws";
const WS_TICKET_PATH = "/api/online-matches/ws-ticket";
const PRODUCTION_API_ORIGIN = "https://ko-card-game.onrender.com";

function apiUrl(path: string): string {
  if (import.meta.env.PROD) return `${PRODUCTION_API_ORIGIN}${path}`;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

async function requestWebSocketTicket(): Promise<string> {
  const response = await fetch(apiUrl(WS_TICKET_PATH), {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("온라인 서버 인증 ticket을 발급받지 못했습니다.");
  }
  const body = (await response.json()) as { ticket?: unknown };
  if (typeof body.ticket !== "string" || body.ticket.length === 0) {
    throw new Error("온라인 서버 인증 ticket 응답이 올바르지 않습니다.");
  }
  return body.ticket;
}

function websocketUrl(ticket?: string): string {
  const query = ticket ? `?ticket=${encodeURIComponent(ticket)}` : "";
  if (import.meta.env.PROD) {
    return `wss://ko-card-game.onrender.com${WS_PATH}${query}`;
  }

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${base}${WS_PATH}${query}`;
}

/**
 * One authenticated socket is shared by the online menu, lobby and match.
 * The lobby message names intentionally live here so a server contract change
 * does not leak into page components.
 */
class OnlineLobbyClient {
  private socket: WebSocket | null = null;
  private connectionState: OnlineLobbyConnectionState = "idle";
  private readonly listeners = new Set<OnlineLobbyListener>();
  private readonly connectionListeners =
    new Set<OnlineLobbyConnectionListener>();
  private lastHandoff: Extract<
    OnlineLobbyMessage,
    { type: "MATCH_FOUND" | "MATCH_STARTING" }
  > | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private shouldReconnect = true;
  private connectingPromise: Promise<void> | null = null;

  get state() {
    return this.connectionState;
  }

  onMessage(listener: OnlineLobbyListener) {
    this.listeners.add(listener);
    if (this.lastHandoff) {
      const handoff = this.lastHandoff;
      this.lastHandoff = null;
      queueMicrotask(() => {
        if (this.listeners.has(listener)) listener(handoff);
      });
    }
    return () => this.listeners.delete(listener);
  }

  onConnectionState(listener: OnlineLobbyConnectionListener) {
    this.connectionListeners.add(listener);
    listener(this.connectionState);
    return () => this.connectionListeners.delete(listener);
  }

  connect() {
    this.shouldReconnect = true;
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.setConnectionState("connecting");
    if (!this.connectingPromise) {
      this.connectingPromise = this.openSocket().finally(() => {
        this.connectingPromise = null;
      });
    }
  }

  private async openSocket(): Promise<void> {
    let ticket: string | undefined;
    try {
      if (import.meta.env.PROD) ticket = await requestWebSocketTicket();
    } catch {
      if (this.shouldReconnect) {
        this.setConnectionState("error");
        this.scheduleReconnect();
      }
      return;
    }
    if (!this.shouldReconnect) return;

    const socket = new WebSocket(websocketUrl(ticket));
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.setConnectionState("open");
    });
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as OnlineServerMessage;
        if (message && typeof message.type === "string") {
          if (
            message.type === "MATCH_FOUND" ||
            message.type === "MATCH_STARTING"
          ) {
            this.lastHandoff = message;
          }
          this.listeners.forEach((listener) => listener(message));
        }
      } catch {
        this.listeners.forEach((listener) =>
          listener({
            type: "LOBBY_ERROR",
            code: "INVALID_SERVER_MESSAGE",
            message: "온라인 서버 응답을 해석하지 못했습니다.",
          }),
        );
      }
    });
    socket.addEventListener("error", () => this.setConnectionState("error"));
    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = null;
        this.setConnectionState("closed");
        this.scheduleReconnect();
      }
    });
  }

  close() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.setConnectionState("closed");
  }

  send(message: OnlineLobbyClientMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.listeners.forEach((listener) =>
        listener({
          type: "LOBBY_ERROR",
          code: "OFFLINE",
          message: "온라인 서버에 연결할 수 없습니다.",
        }),
      );
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private setConnectionState(state: OnlineLobbyConnectionState) {
    this.connectionState = state;
    this.connectionListeners.forEach((listener) => listener(state));
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect || this.reconnectTimer) return;
    const delay = Math.min(500 * 2 ** this.reconnectAttempt, 8000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

let sharedClient: OnlineLobbyClient | null = null;

export function getOnlineLobbyClient() {
  if (!sharedClient) sharedClient = new OnlineLobbyClient();
  return sharedClient;
}
