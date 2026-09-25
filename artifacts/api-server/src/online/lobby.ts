import { randomBytes, randomUUID } from "node:crypto";
import {
  startOnlineMatch,
  userHasActiveMatch,
  validateOnlineDeck,
  type OnlineDeckValidation,
} from "./service";
import { clearActiveMatchPresenceForUsers, lobbyPresence as presence } from "./presence";
import type {
  LobbyRoomState,
  LobbyServerMessage,
  OnlineServerMessage,
} from "./protocol";
import type { OnlineMatchConnection } from "./service";

const ROOM_TTL_MS = 45 * 60 * 1000;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type LobbyConnection = OnlineMatchConnection & {
  readonly nickname: string;
};

type QueueEntry = {
  userId: string;
  deckId: string;
  connection: LobbyConnection;
  joinedAt: number;
};

type RoomMember = {
  userId: string;
  deckId: string;
  connection: LobbyConnection;
  deck: OnlineDeckValidation;
};

type PrivateRoom = {
  roomId: string;
  roomCode: string;
  host: RoomMember;
  guest: RoomMember | null;
  hostReady: boolean;
  guestReady: boolean;
  expiresAt: number;
  expiryTimer: ReturnType<typeof setTimeout>;
};

const quickQueue = new Map<string, QueueEntry>();
const rooms = new Map<string, PrivateRoom>();
const roomsByCode = new Map<string, string>();
let lobbyQueue: Promise<void> = Promise.resolve();

function send(connection: LobbyConnection, message: LobbyServerMessage): void {
  connection.send(message as OnlineServerMessage);
}

function error(connection: LobbyConnection, code: string, message: string): void {
  send(connection, { type: "LOBBY_ERROR", code, message });
}

async function withLobbyLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = lobbyQueue;
  let release!: () => void;
  lobbyQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function createRoomCode(): string {
  const bytes = randomBytes(6);
  return `KO-${[...bytes].map((byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("")}`;
}

function roomMember(room: PrivateRoom, userId: string): { member: RoomMember; role: "HOST" | "GUEST" } | null {
  if (room.host.userId === userId) return { member: room.host, role: "HOST" };
  if (room.guest?.userId === userId) return { member: room.guest, role: "GUEST" };
  return null;
}

function participant(member: RoomMember, ready: boolean): LobbyRoomState["host"] {
  return {
    userId: member.userId,
    nickname: member.connection.nickname,
    deckId: member.deckId,
    championName: member.deck.championName,
    deckName: member.deck.deckName,
    ready,
  };
}

function roomState(room: PrivateRoom, userId: string): LobbyRoomState {
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    youAreHost: room.host.userId === userId,
    host: participant(room.host, room.hostReady),
    guest: room.guest ? participant(room.guest, room.guestReady) : null,
  };
}

function notifyRoom(room: PrivateRoom, messageFor: (userId: string) => LobbyServerMessage): void {
  send(room.host.connection, messageFor(room.host.userId));
  if (room.guest) send(room.guest.connection, messageFor(room.guest.userId));
}

function clearRoom(room: PrivateRoom): void {
  clearTimeout(room.expiryTimer);
  rooms.delete(room.roomId);
  roomsByCode.delete(room.roomCode);
  if (presence.get(room.host.userId) === "PRIVATE_ROOM") presence.set(room.host.userId, "IDLE");
  if (room.guest && presence.get(room.guest.userId) === "PRIVATE_ROOM") {
    presence.set(room.guest.userId, "IDLE");
  }
}

async function ensureCanEnter(connection: LobbyConnection): Promise<boolean> {
  const current = presence.get(connection.userId);
  if (current && current !== "IDLE" && current !== "ACTIVE_MATCH") {
    const code = current === "QUICK_QUEUE" ? "ALREADY_IN_QUEUE"
        : current === "PRIVATE_ROOM" ? "ALREADY_IN_ROOM"
          : "MATCH_STARTING";
    const message = code === "ALREADY_IN_QUEUE"
      ? "이미 빠른 대전 대기 중입니다."
      : code === "ALREADY_IN_ROOM"
        ? "이미 친선전 방에 참가 중입니다."
        : "매치를 준비 중입니다. 잠시만 기다려 주세요.";
    error(connection, code, message);
    return false;
  }
  let hasActiveMatch: boolean;
  try {
    hasActiveMatch = await userHasActiveMatch(connection.userId);
  } catch {
    error(
      connection,
      "MATCH_STATE_UNAVAILABLE",
      "온라인 매치 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    );
    return false;
  }
  if (hasActiveMatch) {
    presence.set(connection.userId, "ACTIVE_MATCH");
    error(connection, "ALREADY_IN_MATCH", "이미 진행 중인 온라인 매치가 있습니다.");
    return false;
  }
  if (current === "ACTIVE_MATCH") clearActiveMatchPresenceForUsers(connection.userId);
  return true;
}

async function validateDeck(connection: LobbyConnection, deckId: string): Promise<OnlineDeckValidation | null> {
  const deck = await validateOnlineDeck(connection.userId, deckId);
  if (!deck.isValid) {
    error(connection, "INVALID_DECK", deck.invalidReasons.join(" ") || "선택한 덱을 사용할 수 없습니다.");
    return null;
  }
  return deck;
}

async function pairQuickQueue(): Promise<void> {
  while (quickQueue.size >= 2) {
    const entries = [...quickQueue.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const first = entries[0];
    const second = entries.find((entry) => entry.userId !== first.userId);
    if (!first || !second) return;

    const firstDeck = await validateOnlineDeck(first.userId, first.deckId);
    if (!firstDeck.isValid) {
      quickQueue.delete(first.userId);
      presence.set(first.userId, "IDLE");
      error(first.connection, "INVALID_DECK", firstDeck.invalidReasons.join(" ") || "선택한 덱을 사용할 수 없습니다.");
      continue;
    }
    const secondDeck = await validateOnlineDeck(second.userId, second.deckId);
    if (!secondDeck.isValid) {
      quickQueue.delete(second.userId);
      presence.set(second.userId, "IDLE");
      error(second.connection, "INVALID_DECK", secondDeck.invalidReasons.join(" ") || "선택한 덱을 사용할 수 없습니다.");
      continue;
    }

    quickQueue.delete(first.userId);
    quickQueue.delete(second.userId);
    presence.set(first.userId, "MATCH_STARTING");
    presence.set(second.userId, "MATCH_STARTING");
    try {
      const runtime = await startOnlineMatch(
        first.userId,
        first.deckId,
        second.userId,
        second.deckId,
      );
      const firstOpponent = {
        nickname: second.connection.nickname,
        championName: secondDeck.championName,
        deckName: secondDeck.deckName,
      };
      const secondOpponent = {
        nickname: first.connection.nickname,
        championName: firstDeck.championName,
        deckName: firstDeck.deckName,
      };
      presence.set(first.userId, "ACTIVE_MATCH");
      presence.set(second.userId, "ACTIVE_MATCH");
      send(first.connection, { type: "MATCH_FOUND", matchId: runtime.matchId, opponent: firstOpponent });
      send(second.connection, { type: "MATCH_FOUND", matchId: runtime.matchId, opponent: secondOpponent });
      send(first.connection, { type: "MATCH_STARTING", matchId: runtime.matchId, opponent: firstOpponent });
      send(second.connection, { type: "MATCH_STARTING", matchId: runtime.matchId, opponent: secondOpponent });
    } catch (matchError) {
      presence.set(first.userId, "IDLE");
      presence.set(second.userId, "IDLE");
      const message = matchError instanceof Error ? matchError.message : "매치를 만들지 못했습니다.";
      error(first.connection, "MATCH_CREATION_FAILED", message);
      error(second.connection, "MATCH_CREATION_FAILED", message);
    }
  }
}

export async function joinQuickQueue(connection: LobbyConnection, deckId: string): Promise<void> {
  await withLobbyLock(async () => {
    const existing = quickQueue.get(connection.userId);
    if (existing) {
      const deck = await validateOnlineDeck(connection.userId, existing.deckId);
      send(connection, {
        type: "QUICK_QUEUE_JOINED",
        deck: {
          deckId: existing.deckId,
          deckName: deck.deckName,
          championName: deck.championName,
        },
      });
      return;
    }
    if (!(await ensureCanEnter(connection))) return;
    if (!deckId.trim()) {
      error(connection, "INVALID_DECK", "온라인 대전에 사용할 덱을 선택해 주세요.");
      return;
    }
    if (!(await validateDeck(connection, deckId))) return;
    quickQueue.set(connection.userId, {
      userId: connection.userId,
      deckId,
      connection,
      joinedAt: Date.now(),
    });
    presence.set(connection.userId, "QUICK_QUEUE");
    await pairQuickQueue();
    if (quickQueue.has(connection.userId)) {
      const deck = await validateOnlineDeck(connection.userId, deckId);
      send(connection, {
        type: "QUICK_QUEUE_JOINED",
        deck: {
          deckId,
          deckName: deck.deckName,
          championName: deck.championName,
        },
      });
    }
  });
}

export async function leaveQuickQueue(connection: LobbyConnection): Promise<void> {
  await withLobbyLock(async () => {
    const entry = quickQueue.get(connection.userId);
    if (!entry || entry.connection !== connection) return;
    quickQueue.delete(connection.userId);
    presence.set(connection.userId, "IDLE");
    send(connection, { type: "QUICK_QUEUE_LEFT" });
  });
}

export async function createPrivateRoom(connection: LobbyConnection, deckId: string): Promise<void> {
  await withLobbyLock(async () => {
    if (!(await ensureCanEnter(connection))) return;
    const deck = await validateDeck(connection, deckId);
    if (!deck) return;
    let roomCode = createRoomCode();
    while (roomsByCode.has(roomCode)) roomCode = createRoomCode();
    const room: PrivateRoom = {
      roomId: randomUUID(),
      roomCode,
      host: { userId: connection.userId, deckId, connection, deck },
      guest: null,
      hostReady: false,
      guestReady: false,
      expiresAt: Date.now() + ROOM_TTL_MS,
      expiryTimer: setTimeout(() => {
        void expirePrivateRoom(room.roomId);
      }, ROOM_TTL_MS),
    };
    rooms.set(room.roomId, room);
    roomsByCode.set(room.roomCode, room.roomId);
    presence.set(connection.userId, "PRIVATE_ROOM");
    send(connection, { type: "PRIVATE_ROOM_CREATED", room: roomState(room, connection.userId) });
  });
}

export async function joinPrivateRoom(
  connection: LobbyConnection,
  rawRoomCode: string,
  deckId: string,
): Promise<void> {
  await withLobbyLock(async () => {
    const roomCode = normalizeRoomCode(rawRoomCode);
    const roomId = roomsByCode.get(roomCode);
    const room = roomId ? rooms.get(roomId) : undefined;
    if (!room) {
      error(connection, "ROOM_NOT_FOUND", "방 코드를 찾을 수 없습니다.");
      return;
    }
    if (room.host.userId === connection.userId) {
      error(connection, "SELF_JOIN_PROTECTION", "자신이 만든 방에는 참가할 수 없습니다.");
      return;
    }
    if (room.guest) {
      error(connection, "ROOM_FULL", "이 방은 이미 가득 찼습니다.");
      return;
    }
    if (!(await ensureCanEnter(connection))) return;
    const deck = await validateDeck(connection, deckId);
    if (!deck) return;
    room.guest = { userId: connection.userId, deckId, connection, deck };
    room.guestReady = false;
    presence.set(connection.userId, "PRIVATE_ROOM");
    send(connection, { type: "PRIVATE_ROOM_JOINED", room: roomState(room, connection.userId) });
    send(room.host.connection, { type: "PRIVATE_ROOM_UPDATED", room: roomState(room, room.host.userId) });
  });
}

async function startPrivateRoomMatch(room: PrivateRoom): Promise<void> {
  if (!room.guest || !room.hostReady || !room.guestReady) return;
  presence.set(room.host.userId, "MATCH_STARTING");
  presence.set(room.guest.userId, "MATCH_STARTING");
  try {
    const runtime = await startOnlineMatch(
      room.host.userId,
      room.host.deckId,
      room.guest.userId,
      room.guest.deckId,
    );
    const hostOpponent = {
      nickname: room.guest.connection.nickname,
      championName: room.guest.deck.championName,
      deckName: room.guest.deck.deckName,
    };
    const guestOpponent = {
      nickname: room.host.connection.nickname,
      championName: room.host.deck.championName,
      deckName: room.host.deck.deckName,
    };
    clearRoom(room);
    presence.set(room.host.userId, "ACTIVE_MATCH");
    presence.set(room.guest.userId, "ACTIVE_MATCH");
    send(room.host.connection, { type: "MATCH_FOUND", matchId: runtime.matchId, opponent: hostOpponent });
    send(room.guest.connection, { type: "MATCH_FOUND", matchId: runtime.matchId, opponent: guestOpponent });
    send(room.host.connection, { type: "MATCH_STARTING", matchId: runtime.matchId, opponent: hostOpponent });
    send(room.guest.connection, { type: "MATCH_STARTING", matchId: runtime.matchId, opponent: guestOpponent });
  } catch (matchError) {
    presence.set(room.host.userId, "PRIVATE_ROOM");
    presence.set(room.guest.userId, "PRIVATE_ROOM");
    const message = matchError instanceof Error ? matchError.message : "매치를 만들지 못했습니다.";
    error(room.host.connection, "MATCH_CREATION_FAILED", message);
    error(room.guest.connection, "MATCH_CREATION_FAILED", message);
  }
}

export async function setPrivateRoomReady(connection: LobbyConnection, ready: boolean): Promise<void> {
  await withLobbyLock(async () => {
    const room = [...rooms.values()].find((candidate) => roomMember(candidate, connection.userId)?.member.connection === connection);
    if (!room) {
      error(connection, "NOT_ROOM_MEMBER", "참가 중인 친선전 방이 없습니다.");
      return;
    }
    const member = roomMember(room, connection.userId);
    if (!member) return;
    if (member.role === "HOST") room.hostReady = ready;
    else room.guestReady = ready;
    notifyRoom(room, (userId) => ({ type: "PRIVATE_ROOM_UPDATED", room: roomState(room, userId) }));
    await startPrivateRoomMatch(room);
  });
}

export async function leavePrivateRoom(connection: LobbyConnection, close = false): Promise<void> {
  await withLobbyLock(async () => {
    const room = [...rooms.values()].find((candidate) => roomMember(candidate, connection.userId)?.member.connection === connection);
    if (!room) {
      error(connection, "NOT_ROOM_MEMBER", "참가 중인 친선전 방이 없습니다.");
      return;
    }
    const membership = roomMember(room, connection.userId);
    if (!membership) return;
    if (membership.role === "HOST" || close) {
      if (membership.role !== "HOST") {
        error(connection, "NOT_ROOM_HOST", "방장만 방을 닫을 수 있습니다.");
        return;
      }
      clearRoom(room);
      send(room.host.connection, { type: "PRIVATE_ROOM_CLOSED" });
      if (room.guest) {
        send(room.guest.connection, { type: "PRIVATE_ROOM_CLOSED" });
        presence.set(room.guest.userId, "IDLE");
      }
      return;
    }
    room.guest = null;
    room.guestReady = false;
    presence.set(connection.userId, "IDLE");
    send(connection, { type: "PRIVATE_ROOM_LEFT" });
    send(room.host.connection, { type: "PRIVATE_ROOM_UPDATED", room: roomState(room, room.host.userId) });
  });
}

async function expirePrivateRoom(roomId: string): Promise<void> {
  await withLobbyLock(async () => {
    const room = rooms.get(roomId);
    if (!room) return;
    clearRoom(room);
    send(room.host.connection, { type: "PRIVATE_ROOM_CLOSED" });
    if (room.guest) send(room.guest.connection, { type: "PRIVATE_ROOM_CLOSED" });
  });
}

export async function detachLobbyConnection(connection: LobbyConnection): Promise<void> {
  await withLobbyLock(async () => {
    const entry = quickQueue.get(connection.userId);
    if (entry?.connection === connection) {
      quickQueue.delete(connection.userId);
      presence.set(connection.userId, "IDLE");
    }
    const room = [...rooms.values()].find((candidate) => {
      const membership = roomMember(candidate, connection.userId);
      return membership?.member.connection === connection;
    });
    if (!room) return;
    const membership = roomMember(room, connection.userId);
    if (!membership) return;
    if (membership.role === "HOST") {
      clearRoom(room);
      if (room.guest) {
        send(room.guest.connection, { type: "PRIVATE_ROOM_CLOSED" });
        presence.set(room.guest.userId, "IDLE");
      }
      return;
    }
    room.guest = null;
    room.guestReady = false;
    presence.set(connection.userId, "IDLE");
    send(room.host.connection, { type: "PRIVATE_ROOM_UPDATED", room: roomState(room, room.host.userId) });
  });
}