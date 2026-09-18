import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  cardsTable,
  championsTable,
  db,
  onlineMatchesTable,
  usersTable,
  type CardRecord,
  type ChampionRecord,
  type OnlineMatchRecord,
} from "@workspace/db";
import {
  cardRecordToDefinition,
  championRecordToDefinition,
  createDeterministicRandom,
  createInitialGameState,
  executeAction,
  getLegalActions,
  startGame,
  type CardDefinition,
  type ChampionDefinition,
  type GameAction,
  type GameState,
} from "@workspace/game-engine";
import { loadUserDeck, resolveDeck } from "../routes/decks";
import { isTestAccountUser } from "../lib/test-account";
import { toServerAction } from "./action-parser";
import {
  sequencedEventsForViewer,
  sanitizeGameStateForViewer,
} from "./sanitizer";
import type {
  OnlineActionPayload,
  OnlineServerMessage,
} from "./protocol";

export type OnlineSeat = "PLAYER_ONE" | "PLAYER_TWO";

export type OnlineMatchSnapshot = {
  player1UserId: string;
  player2UserId: string;
  player1DeckId: string;
  player2DeckId: string;
  cardDefinitions: CardDefinition[];
  championDefinitions: ChampionDefinition[];
};

export interface OnlineMatchConnection {
  readonly userId: string;
  send(message: OnlineServerMessage): void;
}

type CachedAction = {
  userId: string;
  version: number;
  state: GameState;
  eventStart: number;
};

export type OnlineMatchRuntime = {
  matchId: string;
  snapshot: OnlineMatchSnapshot;
  state: GameState;
  version: number;
  requestIds: Map<string, CachedAction>;
  connections: Set<OnlineMatchConnection>;
  queue: Promise<void>;
};

const runtimes = new Map<string, OnlineMatchRuntime>();
const MAX_REQUEST_CACHE = 64;

function seatFor(snapshot: OnlineMatchSnapshot, userId: string): OnlineSeat | null {
  if (snapshot.player1UserId === userId) return "PLAYER_ONE";
  if (snapshot.player2UserId === userId) return "PLAYER_TWO";
  return null;
}

function playerIdForSeat(seat: OnlineSeat): string {
  return seat;
}

function statePlayerIdForUser(snapshot: OnlineMatchSnapshot, userId: string): string | null {
  const seat = seatFor(snapshot, userId);
  return seat ? playerIdForSeat(seat) : null;
}

function seatForStatePlayerId(playerId: string): OnlineSeat {
  return playerId === "PLAYER_TWO" ? "PLAYER_TWO" : "PLAYER_ONE";
}

function seedFromMatchId(matchId: string): number {
  let hash = 2166136261;
  for (const character of matchId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function toCardDefinition(record: CardRecord): CardDefinition {
  return cardRecordToDefinition(record as unknown as Parameters<typeof cardRecordToDefinition>[0]);
}

function toChampionDefinition(record: ChampionRecord): ChampionDefinition {
  return championRecordToDefinition(record as unknown as Parameters<typeof championRecordToDefinition>[0]);
}

function emptyStoredState(): Record<string, never> {
  return {};
}

function snapshotFromRecord(record: OnlineMatchRecord): OnlineMatchSnapshot {
  return record.serializedSnapshot as unknown as OnlineMatchSnapshot;
}

function stateFromRecord(record: OnlineMatchRecord): GameState {
  return record.serializedGameState as unknown as GameState;
}

async function persistRuntime(runtime: OnlineMatchRuntime): Promise<void> {
  const finished = runtime.state.status === "FINISHED";
  const winnerSeat = runtime.state.winnerId
    ? seatForStatePlayerId(runtime.state.winnerId)
    : null;
  const winnerUserId = winnerSeat === "PLAYER_ONE"
    ? runtime.snapshot.player1UserId
    : winnerSeat === "PLAYER_TWO"
      ? runtime.snapshot.player2UserId
      : null;

  const [updated] = await db.update(onlineMatchesTable)
    .set({
      status: finished ? "ENDED" : "ACTIVE",
      serializedGameState: runtime.state,
      stateVersion: runtime.version,
      updatedAt: new Date(),
      endedAt: finished ? new Date() : null,
      winnerUserId,
      resultReason: finished
        ? runtime.state.events.at(-1)?.reason ?? "GAME_FINISHED"
        : null,
    })
    .where(and(
      eq(onlineMatchesTable.id, runtime.matchId),
      eq(onlineMatchesTable.stateVersion, runtime.version - 1),
    ))
    .returning({ id: onlineMatchesTable.id });
  if (!updated) {
    throw new Error("온라인 매치 상태 저장에 실패했습니다.");
  }
}

async function hydrateRuntime(record: OnlineMatchRecord): Promise<OnlineMatchRuntime> {
  const existing = runtimes.get(record.id);
  if (existing) return existing;

  const snapshot = snapshotFromRecord(record);
  const state = stateFromRecord(record);
  if (!snapshot.player2UserId || !state.players?.length) {
    throw new Error("활성화되지 않은 온라인 매치입니다.");
  }

  const runtime: OnlineMatchRuntime = {
    matchId: record.id,
    snapshot,
    state,
    version: record.stateVersion,
    requestIds: new Map(),
    connections: new Set(),
    queue: Promise.resolve(),
  };
  runtimes.set(record.id, runtime);
  return runtime;
}

export async function getOnlineMatchRecord(matchId: string): Promise<OnlineMatchRecord | null> {
  const [record] = await db.select().from(onlineMatchesTable)
    .where(eq(onlineMatchesTable.id, matchId))
    .limit(1);
  return record ?? null;
}

export async function getRuntime(matchId: string): Promise<OnlineMatchRuntime | null> {
  const active = runtimes.get(matchId);
  if (active && active.state.status !== "FINISHED") return active;
  if (active) runtimes.delete(matchId);
  const record = await getOnlineMatchRecord(matchId);
  if (!record || record.status !== "ACTIVE") return null;
  return hydrateRuntime(record);
}

export function matchSeat(runtime: OnlineMatchRuntime, userId: string): OnlineSeat | null {
  return seatFor(runtime.snapshot, userId);
}

export async function createWaitingMatch(
  userId: string,
  deckId: string,
  testAccount = false,
): Promise<OnlineMatchRecord> {
  const deck = await loadUserDeck(userId, deckId);
  if (!deck) throw new Error("선택한 덱을 찾을 수 없습니다.");
  const resolved = await resolveDeck(deck, userId, testAccount);
  if (!resolved.isValid) throw new Error(`덱을 사용할 수 없습니다: ${resolved.invalidReasons.join(" ")}`);

  const [record] = await db.insert(onlineMatchesTable).values({
    id: randomUUID(),
    status: "WAITING",
    player1UserId: userId,
    player1DeckId: deckId,
    serializedSnapshot: emptyStoredState(),
    serializedGameState: emptyStoredState(),
  }).returning();
  if (!record) throw new Error("온라인 매치를 생성하지 못했습니다.");
  return record;
}

export type OnlineDeckValidation = {
  deckId: string;
  deckName: string;
  championName: string | null;
  championDefinitionId: string | null;
  cardDefinitionIds: string[];
  isValid: boolean;
  invalidReasons: string[];
};

export async function validateOnlineDeck(
  userId: string,
  deckId: string,
  testAccountOverride = false,
): Promise<OnlineDeckValidation> {
  const deck = await loadUserDeck(userId, deckId);
  if (!deck) {
    return {
      deckId,
      deckName: "",
      championName: null,
      championDefinitionId: null,
      cardDefinitionIds: [],
      isValid: false,
      invalidReasons: ["선택한 덱을 찾을 수 없습니다."],
    };
  }
  const [account] = await db.select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const resolved = await resolveDeck(
    deck,
    userId,
    testAccountOverride || isTestAccountUser(account),
  );
  return {
    deckId,
    deckName: deck.name,
    championName: resolved.champion?.name ?? null,
    championDefinitionId: resolved.champion?.id ?? null,
    cardDefinitionIds: resolved.cardDefinitionIds,
    isValid: resolved.isValid,
    invalidReasons: resolved.invalidReasons,
  };
}

export async function userHasActiveMatch(userId: string): Promise<boolean> {
  const [record] = await db.select({ id: onlineMatchesTable.id })
    .from(onlineMatchesTable)
    .where(and(
      eq(onlineMatchesTable.status, "ACTIVE"),
      or(
        eq(onlineMatchesTable.player1UserId, userId),
        eq(onlineMatchesTable.player2UserId, userId),
      ),
    ))
    .limit(1);
  return Boolean(record);
}

export async function startOnlineMatch(
  player1UserId: string,
  player1DeckId: string,
  player2UserId: string,
  player2DeckId: string,
  existingWaitingMatchId?: string,
): Promise<OnlineMatchRuntime> {
  if (player1UserId === player2UserId) {
    throw new Error("같은 사용자는 서로 매칭될 수 없습니다.");
  }

  const [firstDeck, secondDeck] = await Promise.all([
    validateOnlineDeck(player1UserId, player1DeckId),
    validateOnlineDeck(player2UserId, player2DeckId),
  ]);
  if (!firstDeck.isValid || !secondDeck.isValid) {
    throw new Error("두 플레이어의 덱이 더 이상 유효하지 않습니다.");
  }

  const [cards, champions] = await Promise.all([
    db.select().from(cardsTable).where(eq(cardsTable.status, "PUBLISHED")),
    db.select().from(championsTable).where(eq(championsTable.status, "PUBLISHED")),
  ]);
  const cardDefinitions = cards.map(toCardDefinition);
  const championDefinitions = champions.map(toChampionDefinition);
  const matchId = existingWaitingMatchId ?? randomUUID();
  const snapshot: OnlineMatchSnapshot = {
    player1UserId,
    player2UserId,
    player1DeckId,
    player2DeckId,
    cardDefinitions,
    championDefinitions,
  };

  const initial = createInitialGameState(
    [firstDeck.championDefinitionId!, secondDeck.championDefinitionId!],
    cardDefinitions,
    championDefinitions,
    [firstDeck.cardDefinitionIds, secondDeck.cardDefinitionIds],
  );
  const state: GameState = {
    ...initial,
    gameId: matchId,
    randomSeed: seedFromMatchId(matchId),
    players: initial.players.map((player, index) => ({
      ...player,
      id: index === 0 ? "PLAYER_ONE" : "PLAYER_TWO",
    })),
  };
  const started = startGame(
    state,
    createDeterministicRandom(matchId),
    { backgrounds: [], bgms: [], attackSounds: {} },
  );

  let record: OnlineMatchRecord | undefined;
  if (existingWaitingMatchId) {
    const [updated] = await db.update(onlineMatchesTable)
      .set({
        status: "ACTIVE",
        player2UserId,
        player2DeckId,
        serializedSnapshot: snapshot,
        serializedGameState: started,
        stateVersion: 0,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(onlineMatchesTable.id, existingWaitingMatchId),
        eq(onlineMatchesTable.status, "WAITING"),
      ))
      .returning();
    record = updated;
  } else {
    const [created] = await db.insert(onlineMatchesTable).values({
      id: matchId,
      status: "ACTIVE",
      player1UserId,
      player2UserId,
      player1DeckId,
      player2DeckId,
      serializedSnapshot: snapshot,
      serializedGameState: started,
      stateVersion: 0,
      startedAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    record = created;
  }
  if (!record) throw new Error("매치 참가 처리에 실패했습니다.");

  return hydrateRuntime(record);
}

export async function joinWaitingMatch(
  matchId: string,
  userId: string,
  deckId: string,
  testAccount = false,
): Promise<OnlineMatchRuntime> {
  const record = await getOnlineMatchRecord(matchId);
  if (!record || record.status !== "WAITING") throw new Error("참가할 수 없는 매치입니다.");
  if (record.player1UserId === userId) throw new Error("같은 사용자는 매치에 두 번 참가할 수 없습니다.");
  return startOnlineMatch(
    record.player1UserId,
    record.player1DeckId,
    userId,
    deckId,
    matchId,
  );
}

async function withRuntimeLock<T>(runtime: OnlineMatchRuntime, task: () => Promise<T>): Promise<T> {
  const previous = runtime.queue;
  let release!: () => void;
  runtime.queue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

export type ActionExecution =
  | { ok: true; runtime: OnlineMatchRuntime; requestId: string; version: number; eventStart: number; duplicate: boolean }
  | { ok: false; runtime: OnlineMatchRuntime; requestId?: string; code: string; message: string };

export async function applyMatchAction(
  matchId: string,
  userId: string,
  requestId: string,
  expectedVersion: number,
  payload: OnlineActionPayload,
): Promise<ActionExecution> {
  const runtime = await getRuntime(matchId);
  if (!runtime) {
    throw new Error("온라인 매치를 찾을 수 없습니다.");
  }
  const playerId = statePlayerIdForUser(runtime.snapshot, userId);
  if (!playerId) {
    return { ok: false, runtime, requestId, code: "FORBIDDEN", message: "매치 참가자만 행동할 수 있습니다." };
  }

  return withRuntimeLock(runtime, async () => {
    const cached = runtime.requestIds.get(requestId);
    if (cached) {
      if (cached.userId !== userId) {
        return { ok: false, runtime, requestId, code: "REQUEST_ID_CONFLICT", message: "requestId를 재사용할 수 없습니다." };
      }
      return {
        ok: true,
        runtime,
        requestId,
        version: cached.version,
        eventStart: cached.eventStart,
        duplicate: true,
      };
    }

    if (expectedVersion !== runtime.version) {
      return { ok: false, runtime, requestId, code: "STALE_VERSION", message: "최신 매치 상태를 먼저 받아야 합니다." };
    }

    const action = toServerAction(payload, playerId);
    if (!action) {
      return { ok: false, runtime, requestId, code: "INVALID_ACTION", message: "알 수 없는 action입니다." };
    }
    const legalActions = action.type === "SURRENDER" ? [action] : getLegalActions(runtime.state, playerId);
    const legal = legalActions.some((candidate) => JSON.stringify(candidate) === JSON.stringify(action));
    if (!legal) {
      return { ok: false, runtime, requestId, code: "INVALID_ACTION", message: "현재 상태에서 허용되지 않는 action입니다." };
    }

    const candidateState = structuredClone(runtime.state);
    const result = executeAction(candidateState, action);
    if (!result.success) {
      return { ok: false, runtime, requestId, code: result.errorCode, message: result.message };
    }

    const eventStart = runtime.state.events.length;
    runtime.state = result.state;
    runtime.version += 1;
    await persistRuntime(runtime);
    runtime.requestIds.set(requestId, {
      userId,
      version: runtime.version,
      state: structuredClone(runtime.state),
      eventStart,
    });
    while (runtime.requestIds.size > MAX_REQUEST_CACHE) {
      const oldest = runtime.requestIds.keys().next().value as string | undefined;
      if (!oldest) break;
      runtime.requestIds.delete(oldest);
    }
    return { ok: true, runtime, requestId, version: runtime.version, eventStart, duplicate: false };
  });
}

export function messageForViewer(
  execution: Extract<ActionExecution, { ok: true }>,
  viewerUserId: string,
): OnlineServerMessage {
  const seat = matchSeat(execution.runtime, viewerUserId);
  const viewerId = seat ? playerIdForSeat(seat) : "PLAYER_ONE";
  const cached = execution.runtime.requestIds.get(execution.requestId);
  const state = cached?.state ?? execution.runtime.state;
  return {
    type: "ACTION_ACCEPTED",
    matchId: execution.runtime.matchId,
    requestId: execution.requestId,
    version: execution.version,
    state: sanitizeGameStateForViewer(state, viewerId),
    events: sequencedEventsForViewer(
      state,
      viewerId,
      state.events.slice(execution.eventStart),
      execution.eventStart,
    ),
  };
}

export function snapshotMessage(runtime: OnlineMatchRuntime, userId: string): OnlineServerMessage {
  const seat = matchSeat(runtime, userId);
  if (!seat) throw new Error("매치 참가자만 상태를 볼 수 있습니다.");
  const viewerId = playerIdForSeat(seat);
  return {
    type: "MATCH_SNAPSHOT",
    matchId: runtime.matchId,
    seat,
    version: runtime.version,
    state: sanitizeGameStateForViewer(runtime.state, viewerId),
    events: sequencedEventsForViewer(runtime.state, viewerId, runtime.state.events),
  };
}

export function rejectionMessage(
  execution: Extract<ActionExecution, { ok: false }>,
): OnlineServerMessage {
  return {
    type: "ACTION_REJECTED",
    matchId: execution.runtime.matchId,
    requestId: execution.requestId,
    code: execution.code,
    message: execution.message,
    currentVersion: execution.runtime.version,
  };
}

export function endedMessageForViewer(
  execution: Extract<ActionExecution, { ok: true }>,
  viewerUserId: string,
): OnlineServerMessage {
  const seat = matchSeat(execution.runtime, viewerUserId);
  const viewerId = seat ? playerIdForSeat(seat) : "PLAYER_ONE";
  const cached = execution.runtime.requestIds.get(execution.requestId);
  const state = cached?.state ?? execution.runtime.state;
  return {
    type: "MATCH_ENDED",
    matchId: execution.runtime.matchId,
    version: execution.version,
    state: sanitizeGameStateForViewer(state, viewerId),
    events: sequencedEventsForViewer(
      state,
      viewerId,
      state.events.slice(execution.eventStart),
      execution.eventStart,
    ),
  };
}

export function broadcastExecution(execution: Extract<ActionExecution, { ok: true }>): void {
  for (const recipient of execution.runtime.connections) {
    recipient.send(messageForViewer(execution, recipient.userId));
  }
  if (execution.runtime.state.status === "FINISHED") {
    for (const recipient of execution.runtime.connections) {
      recipient.send(endedMessageForViewer(execution, recipient.userId));
    }
    cleanupMatchRuntime(execution.runtime.matchId);
  }
}

export function attachConnection(runtime: OnlineMatchRuntime, connection: OnlineMatchConnection): void {
  runtime.connections.add(connection);
}

export function detachConnection(runtime: OnlineMatchRuntime, connection: OnlineMatchConnection): void {
  runtime.connections.delete(connection);
}

export function cleanupMatchRuntime(matchId: string): void {
  const runtime = runtimes.get(matchId);
  if (!runtime) return;
  runtime.connections.clear();
  runtime.requestIds.clear();
  runtimes.delete(matchId);
}