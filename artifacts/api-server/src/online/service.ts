import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  cardsTable,
  championsTable,
  db,
  gameMediaTable,
  onlineMatchesTable,
  championIntroInteractionsTable,
  rewardSettingsTable,
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
  normalizeHiddenZoneCards,
  validateCardDefinitionReferences,
  executeAction,
  getLegalActions,
  startGame,
  type CardDefinition,
  type ChampionDefinition,
  type GameAction,
  type GameState,
  type GameMediaCatalog,
} from "@workspace/game-engine";
import { loadUserDeck, resolveDeck } from "../routes/decks";
import { isTestAccountUser } from "../lib/test-account";
import { processMatchEventsForDailyQuests } from "../lib/daily-quest-service";
import { grantReward, isFinishedMatchRewardEligible } from "../lib/reward-service";
import { logger } from "../lib/logger";
import { runOnlineBackgroundTask } from "./background-task";
import { toServerAction } from "./action-parser";
import { directActionStartsTargeting, rejectedActionCode } from "./action-validation";
import {
  sequencedEventsForViewer,
  sanitizeGameStateForViewer,
} from "./sanitizer";
import { ONLINE_MATCH_CONFIG } from "./config";
import { classifyActiveMatch } from "./match-lifecycle";
import { clearActiveMatchPresenceForUsers } from "./presence";
import { mapIntroToSeats, resolveChampionIntro } from "./intro";
import type {
  OnlineActionPayload,
  OnlineServerMessage,
  OnlinePublicPlayerMetadata,
} from "./protocol";

export type OnlineSeat = "PLAYER_ONE" | "PLAYER_TWO";

export type OnlineMatchSnapshot = {
  player1UserId: string;
  player2UserId: string;
  player1DeckId: string;
  player2DeckId: string;
  cardDefinitions: CardDefinition[];
  championDefinitions: ChampionDefinition[];
  publicPlayers: OnlinePublicPlayerMetadata[];
  introFirstSpeaker: "PLAYER_ONE" | "PLAYER_TWO" | null;
};

export interface OnlineMatchConnection {
  readonly userId: string;
  send(message: OnlineServerMessage): void;
}

export type OnlineConnectionStatus = "CONNECTED" | "DISCONNECTED_GRACE" | "FORFEITED";

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
  primaryConnections: Map<string, OnlineMatchConnection>;
  connectionStates: Record<OnlineSeat, OnlineConnectionStatus>;
  disconnectStartedAt: Partial<Record<OnlineSeat, number>>;
  reconnectDeadlineAt: Partial<Record<OnlineSeat, number>>;
  turnStartedAt: number | null;
  turnDeadlineAt: number | null;
  gameplayStartsAt: number | null;
  resultReason: string | null;
  queue: Promise<void>;
  turnTimer: ReturnType<typeof setTimeout> | null;
  disconnectTimers: Map<OnlineSeat, ReturnType<typeof setTimeout>>;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
};

const runtimes = new Map<string, OnlineMatchRuntime>();
const runtimeRestores = new Map<string, Promise<OnlineMatchRuntime | null>>();
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
  const state = normalizeHiddenZoneCards(record.serializedGameState as unknown as GameState);
  validateCardDefinitionReferences(state);
  return state;
}

function runRuntimeBackgroundTask(
  runtime: OnlineMatchRuntime,
  operation: string,
  task: () => Promise<unknown>,
): void {
  runOnlineBackgroundTask(
    task,
    {
      requestId: `${operation}:${runtime.matchId}:${runtime.version}`,
      route: `background.${operation}`,
      matchId: runtime.matchId,
    },
    (failure) => logger.error(failure, "Online background task failed"),
  );
}

async function persistRuntime(runtime: OnlineMatchRuntime, eventStart?: number): Promise<void> {
  const finished = runtime.state.status === "FINISHED";
  const winnerSeat = runtime.state.winnerId
    ? seatForStatePlayerId(runtime.state.winnerId)
    : null;
  const winnerUserId = winnerSeat === "PLAYER_ONE"
    ? runtime.snapshot.player1UserId
    : winnerSeat === "PLAYER_TWO"
      ? runtime.snapshot.player2UserId
      : null;

  const persisted = await db.transaction(async (tx) => {
    const [updated] = await tx.update(onlineMatchesTable)
      .set({
        status: finished ? "ENDED" : "ACTIVE",
        serializedGameState: runtime.state,
        stateVersion: runtime.version,
        turnStartedAt: runtime.turnStartedAt ? new Date(runtime.turnStartedAt) : null,
        turnDeadlineAt: runtime.turnDeadlineAt ? new Date(runtime.turnDeadlineAt) : null,
        gameplayStartsAt: runtime.gameplayStartsAt ? new Date(runtime.gameplayStartsAt) : null,
        player1DisconnectStartedAt: runtime.disconnectStartedAt.PLAYER_ONE
          ? new Date(runtime.disconnectStartedAt.PLAYER_ONE)
          : null,
        player1ReconnectDeadlineAt: runtime.reconnectDeadlineAt.PLAYER_ONE
          ? new Date(runtime.reconnectDeadlineAt.PLAYER_ONE)
          : null,
        player2DisconnectStartedAt: runtime.disconnectStartedAt.PLAYER_TWO
          ? new Date(runtime.disconnectStartedAt.PLAYER_TWO)
          : null,
        player2ReconnectDeadlineAt: runtime.reconnectDeadlineAt.PLAYER_TWO
          ? new Date(runtime.reconnectDeadlineAt.PLAYER_TWO)
          : null,
        updatedAt: new Date(),
        endedAt: finished ? new Date() : null,
        winnerUserId,
        resultReason: finished ? runtime.resultReason ?? runtime.state.events.at(-1)?.reason ?? "GAME_FINISHED" : null,
      })
      .where(and(
        eq(onlineMatchesTable.id, runtime.matchId),
        eq(onlineMatchesTable.stateVersion, runtime.version - 1),
      ))
      .returning({ id: onlineMatchesTable.id });
    if (!updated) return false;

    if (eventStart !== undefined) {
      await processMatchEventsForDailyQuests(
        runtime.snapshot.player1UserId,
        "PLAYER_ONE",
        runtime.matchId,
        runtime.state,
        eventStart,
        tx,
      );
      await processMatchEventsForDailyQuests(
        runtime.snapshot.player2UserId,
        "PLAYER_TWO",
        runtime.matchId,
        runtime.state,
        eventStart,
        tx,
      );
    }
    return true;
  });
  if (!persisted) {
    throw new Error("온라인 매치 상태 저장에 실패했습니다.");
  }
  if (finished) {
    clearActiveMatchPresenceForUsers(
      runtime.snapshot.player1UserId,
      runtime.snapshot.player2UserId,
    );
    try {
      await settleFinishedOnlineMatch(runtime);
    } catch (error) {
      logger.error({ error, matchId: runtime.matchId }, "온라인 매치 보상 정산에 실패했습니다.");
    }
  }
}

async function settleFinishedOnlineMatch(
  runtime: Pick<OnlineMatchRuntime, "matchId" | "snapshot" | "state" | "resultReason">,
): Promise<void> {
  const winnerUserId = runtime.state.winnerId === "PLAYER_TWO"
    ? runtime.snapshot.player2UserId
    : runtime.state.winnerId === "PLAYER_ONE"
      ? runtime.snapshot.player1UserId
      : null;
  if (!isFinishedMatchRewardEligible(runtime.state.status, winnerUserId, runtime.resultReason) || !winnerUserId) return;

  const settings = await db.select().from(rewardSettingsTable).where(inArray(
    rewardSettingsTable.key,
    ["MATCH_ONLINE_WIN", "MATCH_ONLINE_LOSS"],
  ));
  const winSetting = settings.find((setting) => setting.key === "MATCH_ONLINE_WIN");
  const lossSetting = settings.find((setting) => setting.key === "MATCH_ONLINE_LOSS");
  const loserUserId = winnerUserId === runtime.snapshot.player1UserId
    ? runtime.snapshot.player2UserId
    : runtime.snapshot.player1UserId;

  await db.transaction(async (tx) => {
    if (winSetting?.enabled && winSetting.rewardType === "CURRENCY" && winSetting.amount > 0) {
      await grantReward({
        userId: winnerUserId,
        sourceType: "MATCH_ONLINE_WIN",
        sourceId: runtime.matchId,
        rewardType: winSetting.rewardType,
        amount: winSetting.amount,
        metadata: { resultReason: runtime.resultReason ?? "GAME_FINISHED" },
      }, tx);
    }
    if (lossSetting?.enabled && lossSetting.rewardType === "CURRENCY" && lossSetting.amount > 0) {
      await grantReward({
        userId: loserUserId,
        sourceType: "MATCH_ONLINE_LOSS",
        sourceId: runtime.matchId,
        rewardType: lossSetting.rewardType,
        amount: lossSetting.amount,
        metadata: { resultReason: runtime.resultReason ?? "GAME_FINISHED" },
      }, tx);
    }
  });
}

function storedGameState(record: OnlineMatchRecord): Partial<GameState> {
  const value = record.serializedGameState as unknown;
  return value && typeof value === "object" ? value as Partial<GameState> : {};
}

function hasResumableRuntimeData(record: OnlineMatchRecord): boolean {
  const state = storedGameState(record);
  const snapshotValue = record.serializedSnapshot as unknown;
  const snapshot = snapshotValue && typeof snapshotValue === "object"
    ? snapshotValue as Partial<OnlineMatchSnapshot>
    : {};
  if (
    classifyActiveMatch(record.status, state.status) !== "RESUMABLE" ||
    !record.player2UserId ||
    snapshot.player1UserId !== record.player1UserId ||
    snapshot.player2UserId !== record.player2UserId ||
    snapshot.player1UserId === snapshot.player2UserId ||
    !Array.isArray(snapshot.cardDefinitions) ||
    !Array.isArray(snapshot.championDefinitions) ||
    !Array.isArray(snapshot.publicPlayers) ||
    snapshot.publicPlayers.length !== 2 ||
    !Array.isArray(state.players) ||
    state.players.length !== 2
  ) {
    return false;
  }
  try {
    stateFromRecord(record as OnlineMatchRecord);
    return true;
  } catch {
    return false;
  }
}

function storedResultReason(state: Partial<GameState>): string {
  const lastEvent = Array.isArray(state.events) ? state.events.at(-1) : undefined;
  return typeof lastEvent?.reason === "string" ? lastEvent.reason : "GAME_FINISHED";
}

async function reconcileActiveMatchRecord(
  record: OnlineMatchRecord,
  attempts = 0,
): Promise<OnlineMatchRecord | null> {
  const state = storedGameState(record);
  const disposition = classifyActiveMatch(record.status, state.status);
  if (disposition === "RESUMABLE" && hasResumableRuntimeData(record)) return record;

  const finished = disposition === "FINISHED";
  const winnerUserId = state.winnerId === "PLAYER_ONE"
    ? record.player1UserId
    : state.winnerId === "PLAYER_TWO"
      ? record.player2UserId
      : null;
  const resultReason = finished ? storedResultReason(state) : "UNRECOVERABLE_MATCH_STATE";
  const [updated] = await db.update(onlineMatchesTable)
    .set({
      status: finished ? "ENDED" : "CANCELLED",
      endedAt: new Date(),
      updatedAt: new Date(),
      winnerUserId: finished ? winnerUserId : null,
      resultReason,
    })
    .where(and(
      eq(onlineMatchesTable.id, record.id),
      eq(onlineMatchesTable.status, "ACTIVE"),
      eq(onlineMatchesTable.stateVersion, record.stateVersion),
    ))
    .returning();

  if (!updated) {
    const latest = await getOnlineMatchRecord(record.id);
    if (!latest || latest.status !== "ACTIVE" || attempts >= 3) return null;
    return reconcileActiveMatchRecord(latest, attempts + 1);
  }

  clearActiveMatchPresenceForUsers(record.player1UserId, record.player2UserId);
  cleanupMatchRuntime(record.id);
  if (finished) {
    try {
      const validState = stateFromRecord(record);
      await settleFinishedOnlineMatch({
        matchId: record.id,
        snapshot: snapshotFromRecord(record),
        state: validState,
        resultReason,
      });
    } catch (error) {
      logger.error({ error, matchId: record.id }, "복구 중 종료 매치 보상 정산에 실패했습니다.");
    }
  } else {
    logger.error(
      { matchId: record.id },
      "복구할 수 없는 활성 온라인 매치를 취소 상태로 보존했습니다.",
    );
  }
  return null;
}

async function persistConnectionState(runtime: OnlineMatchRuntime): Promise<void> {
  await db.update(onlineMatchesTable)
    .set({
      player1DisconnectStartedAt: runtime.disconnectStartedAt.PLAYER_ONE
        ? new Date(runtime.disconnectStartedAt.PLAYER_ONE)
        : null,
      player1ReconnectDeadlineAt: runtime.reconnectDeadlineAt.PLAYER_ONE
        ? new Date(runtime.reconnectDeadlineAt.PLAYER_ONE)
        : null,
      player2DisconnectStartedAt: runtime.disconnectStartedAt.PLAYER_TWO
        ? new Date(runtime.disconnectStartedAt.PLAYER_TWO)
        : null,
      player2ReconnectDeadlineAt: runtime.reconnectDeadlineAt.PLAYER_TWO
        ? new Date(runtime.reconnectDeadlineAt.PLAYER_TWO)
        : null,
      updatedAt: new Date(),
    })
    .where(and(eq(onlineMatchesTable.id, runtime.matchId), eq(onlineMatchesTable.status, "ACTIVE")));
}

function timestamp(value: Date | null): number | null {
  return value?.getTime() ?? null;
}

function restoredConnectionState(): OnlineConnectionStatus {
  return "DISCONNECTED_GRACE";
}

async function hydrateRuntime(record: OnlineMatchRecord): Promise<OnlineMatchRuntime> {
  const existing = runtimes.get(record.id);
  if (existing) return existing;

  const snapshot = snapshotFromRecord(record);
  const state = stateFromRecord(record);
  if (!snapshot.player2UserId || !state.players?.length) {
    throw new Error("활성화되지 않은 온라인 매치입니다.");
  }

  const now = Date.now();
  const player1Deadline = timestamp(record.player1ReconnectDeadlineAt) ?? now + ONLINE_MATCH_CONFIG.reconnectGraceSeconds * 1000;
  const player2Deadline = timestamp(record.player2ReconnectDeadlineAt) ?? now + ONLINE_MATCH_CONFIG.reconnectGraceSeconds * 1000;
  const runtime: OnlineMatchRuntime = {
    matchId: record.id,
    snapshot,
    state,
    version: record.stateVersion,
    requestIds: new Map(),
    connections: new Set(),
    primaryConnections: new Map(),
    connectionStates: {
      PLAYER_ONE: restoredConnectionState(),
      PLAYER_TWO: restoredConnectionState(),
    },
    disconnectStartedAt: {
      PLAYER_ONE: timestamp(record.player1DisconnectStartedAt) ?? now,
      PLAYER_TWO: timestamp(record.player2DisconnectStartedAt) ?? now,
    },
    reconnectDeadlineAt: {
      ...(player1Deadline ? { PLAYER_ONE: player1Deadline } : {}),
      ...(player2Deadline ? { PLAYER_TWO: player2Deadline } : {}),
    },
    turnStartedAt: timestamp(record.turnStartedAt),
    turnDeadlineAt: timestamp(record.turnDeadlineAt),
    gameplayStartsAt: timestamp(record.gameplayStartsAt),
    resultReason: record.resultReason,
    queue: Promise.resolve(),
    turnTimer: null,
    disconnectTimers: new Map(),
    cleanupTimer: null,
  };
  runtimes.set(record.id, runtime);
  if (state.status !== "FINISHED") {
    runRuntimeBackgroundTask(
      runtime,
      "restore-connection-state",
      () => persistConnectionState(runtime),
    );
    if (!runtime.gameplayStartsAt || now >= runtime.gameplayStartsAt) scheduleTurnTimer(runtime);
    else setTimeout(() => {
      runRuntimeBackgroundTask(runtime, "gameplay-start", () => withRuntimeLock(runtime, async () => {
        if (runtime.state.status === "FINISHED" || !runtime.gameplayStartsAt || Date.now() < runtime.gameplayStartsAt) return;
        runtime.turnStartedAt = runtime.gameplayStartsAt;
        runtime.turnDeadlineAt = runtime.gameplayStartsAt + ONLINE_MATCH_CONFIG.turnTimeLimitSeconds * 1000;
        await persistRuntime(runtime);
        scheduleTurnTimer(runtime);
      }));
    }, Math.max(0, runtime.gameplayStartsAt - now));
    scheduleDisconnectTimers(runtime);
  }
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
  if (active) cleanupMatchRuntime(matchId);
  const pending = runtimeRestores.get(matchId);
  if (pending) return pending;
  const restore = (async () => {
    let record = await getOnlineMatchRecord(matchId);
    if (!record) return null;
    if (record.status === "ACTIVE") {
      const resumable = await reconcileActiveMatchRecord(record);
      if (resumable) {
        record = resumable;
      } else {
        const reconciled = await getOnlineMatchRecord(matchId);
        if (!reconciled || reconciled.status !== "ENDED") return null;
        record = reconciled;
      }
    }
    if (record.status !== "ACTIVE" && record.status !== "ENDED") return null;
    if (record.status === "ENDED" && storedGameState(record).status !== "FINISHED") {
      clearActiveMatchPresenceForUsers(record.player1UserId, record.player2UserId);
      logger.error(
        { matchId },
        "종료 상태와 저장된 게임 상태가 일치하지 않아 매치를 복구하지 않았습니다.",
      );
      return null;
    }
    const runtime = await hydrateRuntime(record);
    if (record.status === "ENDED" && runtime.state.status === "FINISHED") {
      clearActiveMatchPresenceForUsers(
        runtime.snapshot.player1UserId,
        runtime.snapshot.player2UserId,
      );
      try {
        await settleFinishedOnlineMatch(runtime);
      } catch (error) {
        logger.error({ error, matchId }, "저장된 종료 매치 보상 재정산에 실패했습니다.");
      }
      scheduleRuntimeCleanup(runtime);
    }
    return runtime;
  })();
  runtimeRestores.set(matchId, restore);
  try {
    return await restore;
  } finally {
    runtimeRestores.delete(matchId);
  }
}

function clearTurnTimer(runtime: OnlineMatchRuntime): void {
  if (runtime.turnTimer) clearTimeout(runtime.turnTimer);
  runtime.turnTimer = null;
}

function clearDisconnectTimer(runtime: OnlineMatchRuntime, seat: OnlineSeat): void {
  const timer = runtime.disconnectTimers.get(seat);
  if (timer) clearTimeout(timer);
  runtime.disconnectTimers.delete(seat);
}

function connectionStatusMessage(
  runtime: OnlineMatchRuntime,
  seat: OnlineSeat,
): OnlineServerMessage {
  return {
    type: "MATCH_CONNECTION_STATUS",
    matchId: runtime.matchId,
    playerId: seat,
    status: runtime.connectionStates[seat],
    reconnectDeadlineAt: runtime.reconnectDeadlineAt[seat] ?? null,
    serverTime: Date.now(),
  };
}

function broadcastConnectionStatus(runtime: OnlineMatchRuntime, seat: OnlineSeat): void {
  const message = connectionStatusMessage(runtime, seat);
  for (const connection of runtime.connections) connection.send(message);
}

function scheduleTurnTimer(runtime: OnlineMatchRuntime): void {
  clearTurnTimer(runtime);
  if (runtime.state.status === "FINISHED" || !runtime.turnDeadlineAt) return;
  const expectedTurn = runtime.state.turn;
  const expectedDeadline = runtime.turnDeadlineAt;
  const delay = Math.max(0, expectedDeadline - Date.now());
  runtime.turnTimer = setTimeout(() => {
    runRuntimeBackgroundTask(runtime, "turn-timeout", () => withRuntimeLock(runtime, async () => {
      if (
        runtime.state.status === "FINISHED" ||
        runtime.state.turn !== expectedTurn ||
        runtime.turnDeadlineAt !== expectedDeadline
      ) {
        return;
      }
      if (Date.now() < expectedDeadline) {
        scheduleTurnTimer(runtime);
        return;
      }
      await resolveTurnTimeoutLocked(runtime);
    }));
  }, delay);
}

function scheduleDisconnectTimers(runtime: OnlineMatchRuntime): void {
  for (const seat of ["PLAYER_ONE", "PLAYER_TWO"] as const) {
    clearDisconnectTimer(runtime, seat);
    const deadline = runtime.reconnectDeadlineAt[seat];
    if (runtime.connectionStates[seat] !== "DISCONNECTED_GRACE" || !deadline) continue;
    const expectedDeadline = deadline;
    runtime.disconnectTimers.set(seat, setTimeout(() => {
      runRuntimeBackgroundTask(runtime, `disconnect-timeout-${seat.toLowerCase()}`, () => withRuntimeLock(runtime, async () => {
        if (
          runtime.state.status === "FINISHED" ||
          runtime.connectionStates[seat] !== "DISCONNECTED_GRACE" ||
          runtime.reconnectDeadlineAt[seat] !== expectedDeadline
        ) {
          return;
        }
        if (Date.now() < expectedDeadline) {
          scheduleDisconnectTimers(runtime);
          return;
        }
        await resolveDisconnectTimeoutLocked(runtime, seat);
      }));
    }, Math.max(0, expectedDeadline - Date.now())));
  }
}

function setNextTurnDeadline(runtime: OnlineMatchRuntime): void {
  runtime.turnStartedAt = Date.now();
  runtime.turnDeadlineAt = runtime.turnStartedAt + ONLINE_MATCH_CONFIG.turnTimeLimitSeconds * 1000;
}

function appendTimeoutEvent(state: GameState, playerId: string): GameState {
  return {
    ...state,
    events: [
      ...state.events,
      {
        type: "TURN_TIMEOUT",
        playerId,
        source: { type: "SYSTEM" },
        target: { type: "PLAYER", playerId },
        reason: "AUTO_END_TURN",
      },
    ],
  };
}

async function commitTransition(
  runtime: OnlineMatchRuntime,
  state: GameState,
  eventStart: number,
  resultReason: string | null = null,
): Promise<{ version: number; eventStart: number }> {
  const turnChanged = state.turn !== runtime.state.turn || state.activePlayerId !== runtime.state.activePlayerId;
  const previous = {
    state: runtime.state,
    version: runtime.version,
    resultReason: runtime.resultReason,
    turnStartedAt: runtime.turnStartedAt,
    turnDeadlineAt: runtime.turnDeadlineAt,
    gameplayStartsAt: runtime.gameplayStartsAt,
  };
  runtime.state = turnChanged ? state : state;
  runtime.version += 1;
  runtime.resultReason = resultReason;
  if (turnChanged && runtime.state.status !== "FINISHED") setNextTurnDeadline(runtime);
  try {
    await persistRuntime(runtime, eventStart);
  } catch (error) {
    runtime.state = previous.state;
    runtime.version = previous.version;
    runtime.resultReason = previous.resultReason;
    runtime.turnStartedAt = previous.turnStartedAt;
    runtime.turnDeadlineAt = previous.turnDeadlineAt;
    runtime.gameplayStartsAt = previous.gameplayStartsAt;
    throw error;
  }
  if (runtime.state.status === "FINISHED") {
    clearTurnTimer(runtime);
    for (const seat of ["PLAYER_ONE", "PLAYER_TWO"] as const) clearDisconnectTimer(runtime, seat);
  } else if (turnChanged) {
    scheduleTurnTimer(runtime);
  }
  return { version: runtime.version, eventStart };
}

async function resolveTurnTimeoutLocked(runtime: OnlineMatchRuntime): Promise<void> {
  if (runtime.state.status === "FINISHED" || !runtime.state.activePlayerId) return;
  const playerId = runtime.state.activePlayerId;
  const candidate = structuredClone(runtime.state);
  candidate.targetingState = undefined;
  const result = executeAction(candidate, { type: "END_TURN", playerId });
  if (!result.success) return;
  const eventStart = runtime.state.events.length;
  const nextState = appendTimeoutEvent(result.state, playerId);
  await commitTransition(runtime, nextState, eventStart);
  const execution = {
    ok: true as const,
    runtime,
    requestId: `turn-timeout:${runtime.matchId}:${runtime.version}`,
    version: runtime.version,
    eventStart,
    duplicate: false,
  };
  broadcastExecution(execution);
}

async function resolveDisconnectTimeoutLocked(
  runtime: OnlineMatchRuntime,
  forfeitingSeat: OnlineSeat,
): Promise<void> {
  if (runtime.state.status === "FINISHED") return;
  const winnerSeat: OnlineSeat = forfeitingSeat === "PLAYER_ONE" ? "PLAYER_TWO" : "PLAYER_ONE";
  const eventStart = runtime.state.events.length;
  const nextState: GameState = {
    ...runtime.state,
    status: "FINISHED",
    winnerId: playerIdForSeat(winnerSeat),
    loserId: playerIdForSeat(forfeitingSeat),
    events: [
      ...runtime.state.events,
      {
        type: "SURRENDER",
        playerId: playerIdForSeat(forfeitingSeat),
        source: { type: "SYSTEM" },
        target: { type: "PLAYER", playerId: playerIdForSeat(forfeitingSeat) },
        reason: "DISCONNECT_TIMEOUT",
      },
    ],
  };
  await commitTransition(runtime, nextState, eventStart, "DISCONNECT_TIMEOUT");
  runtime.connectionStates[forfeitingSeat] = "FORFEITED";
  const execution = {
    ok: true as const,
    runtime,
    requestId: `disconnect-timeout:${runtime.matchId}:${runtime.version}`,
    version: runtime.version,
    eventStart,
    duplicate: false,
  };
  broadcastExecution(execution);
}

export function matchSeat(runtime: OnlineMatchRuntime, userId: string): OnlineSeat | null {
  return seatFor(runtime.snapshot, userId);
}

export async function createWaitingMatch(
  userId: string,
  deckId: string,
  testAccount = false,
): Promise<OnlineMatchRecord> {
  const existing = await getOpenMatchForUser(userId);
  if (existing) throw new Error("이미 참가 중인 온라인 매치가 있습니다.");
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
  const record = await getActiveMatchForUser(userId);
  return Boolean(record);
}

async function getOpenMatchForUser(userId: string): Promise<OnlineMatchRecord | null> {
  const records = await db.select()
    .from(onlineMatchesTable)
    .where(and(
      or(
        eq(onlineMatchesTable.status, "WAITING"),
        eq(onlineMatchesTable.status, "ACTIVE"),
      ),
      or(
        eq(onlineMatchesTable.player1UserId, userId),
        eq(onlineMatchesTable.player2UserId, userId),
      ),
    ))
    .orderBy(onlineMatchesTable.createdAt);
  for (const record of records) {
    if (record.status === "WAITING") return record;
    const resumable = await reconcileActiveMatchRecord(record);
    if (resumable) return resumable;
  }
  return null;
}

export async function getActiveMatchForUser(userId: string): Promise<OnlineMatchRecord | null> {
  const records = await db.select()
    .from(onlineMatchesTable)
    .where(and(
      eq(onlineMatchesTable.status, "ACTIVE"),
      or(
        eq(onlineMatchesTable.player1UserId, userId),
        eq(onlineMatchesTable.player2UserId, userId),
      ),
    ));
  for (const record of records) {
    const resumable = await reconcileActiveMatchRecord(record);
    if (resumable) return resumable;
  }
  return null;
}

export type AbandonOnlineMatchResult =
  | "ABANDONED"
  | "ALREADY_TERMINAL"
  | "NOT_FOUND"
  | "FORBIDDEN";

export async function abandonOnlineMatch(
  matchId: string,
  userId: string,
): Promise<AbandonOnlineMatchResult> {
  let record = await getOnlineMatchRecord(matchId);
  if (!record) return "NOT_FOUND";
  if (record.player1UserId !== userId && record.player2UserId !== userId) return "FORBIDDEN";
  if (record.status === "ENDED" || record.status === "CANCELLED") {
    clearActiveMatchPresenceForUsers(record.player1UserId, record.player2UserId);
    return "ALREADY_TERMINAL";
  }

  if (record.status === "WAITING") {
    if (record.player1UserId !== userId || record.player2UserId) return "ALREADY_TERMINAL";
    const [cancelled] = await db.update(onlineMatchesTable)
      .set({
        status: "CANCELLED",
        endedAt: new Date(),
        updatedAt: new Date(),
        resultReason: "PLAYER_ABANDONED_BEFORE_START",
      })
      .where(and(
        eq(onlineMatchesTable.id, matchId),
        eq(onlineMatchesTable.status, "WAITING"),
        eq(onlineMatchesTable.player1UserId, userId),
        isNull(onlineMatchesTable.player2UserId),
      ))
      .returning({ id: onlineMatchesTable.id });
    if (cancelled) {
      clearActiveMatchPresenceForUsers(record.player1UserId, record.player2UserId);
      return "ABANDONED";
    }
    record = await getOnlineMatchRecord(matchId);
    return record && (record.status === "ENDED" || record.status === "CANCELLED")
      ? "ALREADY_TERMINAL"
      : "NOT_FOUND";
  }

  const resumable = await reconcileActiveMatchRecord(record);
  if (!resumable) return "ALREADY_TERMINAL";
  const runtime = await getRuntime(matchId);
  if (!runtime) return "ALREADY_TERMINAL";
  const playerId = statePlayerIdForUser(runtime.snapshot, userId);
  if (!playerId) return "FORBIDDEN";

  return withRuntimeLock(runtime, async () => {
    if (runtime.state.status === "FINISHED") {
      clearActiveMatchPresenceForUsers(
        runtime.snapshot.player1UserId,
        runtime.snapshot.player2UserId,
      );
      return "ALREADY_TERMINAL";
    }
    const eventStart = runtime.state.events.length;
    const result = executeAction(structuredClone(runtime.state), {
      type: "SURRENDER",
      playerId,
    });
    if (!result.success) {
      throw new Error(result.message || "온라인 매치를 종료하지 못했습니다.");
    }
    await commitTransition(runtime, result.state, eventStart, "PLAYER_ABANDONED");
    broadcastExecution({
      ok: true,
      runtime,
      requestId: `abandon:${matchId}:${userId}`,
      version: runtime.version,
      eventStart,
      duplicate: false,
    });
    return "ABANDONED";
  });
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

  const [cards, champions, media, interactions] = await Promise.all([
    db.select().from(cardsTable).where(eq(cardsTable.status, "PUBLISHED")),
    db.select().from(championsTable).where(eq(championsTable.status, "PUBLISHED")),
    db.select({
      id: gameMediaTable.id,
      mediaType: gameMediaTable.mediaType,
      name: gameMediaTable.name,
      assetUrl: gameMediaTable.assetUrl,
      width: gameMediaTable.width,
      height: gameMediaTable.height,
      volume: gameMediaTable.volume,
    }).from(gameMediaTable)
      .where(eq(gameMediaTable.gameEnabled, true)),
    db.select().from(championIntroInteractionsTable),
  ]);
  const cardDefinitions = cards.map(toCardDefinition);
  const championDefinitions = champions.map(toChampionDefinition);
  const users = await db.select({ id: usersTable.id, nickname: usersTable.nickname })
    .from(usersTable)
    .where(or(eq(usersTable.id, player1UserId), eq(usersTable.id, player2UserId)));
  const firstChampion = championDefinitions.find((champion) => champion.id === firstDeck.championDefinitionId)!;
  const secondChampion = championDefinitions.find((champion) => champion.id === secondDeck.championDefinitionId)!;
  if (!firstChampion || !secondChampion) {
    throw new Error("선택한 챔피언이 현재 공개 카탈로그에 없습니다.");
  }
  const resolvedIntro = resolveChampionIntro(firstChampion, secondChampion, interactions);
  const seatIntro = mapIntroToSeats(firstChampion.id, secondChampion.id, resolvedIntro);
  const mediaCatalog: GameMediaCatalog = {
    backgrounds: media.filter((item) => item.mediaType === "BACKGROUND") as GameMediaCatalog["backgrounds"],
    bgms: media.filter((item) => item.mediaType === "BGM") as GameMediaCatalog["bgms"],
    attackSounds: Object.fromEntries(
      media
        .filter((item) => item.mediaType !== "BACKGROUND" && item.mediaType !== "BGM")
        .map((item) => [item.mediaType, item]),
    ),
  };
  const matchId = existingWaitingMatchId ?? randomUUID();
  const snapshot: OnlineMatchSnapshot = {
    player1UserId,
    player2UserId,
    player1DeckId,
    player2DeckId,
    cardDefinitions,
    championDefinitions,
    publicPlayers: [
      {
        seat: "PLAYER_ONE",
        displayName: users.find((user) => user.id === player1UserId)?.nickname ?? "Player",
        championDefinitionId: firstDeck.championDefinitionId!,
        championName: firstDeck.championName!,
        portraitUrl: championDefinitions.find((champion) => champion.id === firstDeck.championDefinitionId)?.imageUrl ?? null,
        dialogueLine: seatIntro.playerOneLine,
      },
      {
        seat: "PLAYER_TWO",
        displayName: users.find((user) => user.id === player2UserId)?.nickname ?? "Player",
        championDefinitionId: secondDeck.championDefinitionId!,
        championName: secondDeck.championName!,
        portraitUrl: championDefinitions.find((champion) => champion.id === secondDeck.championDefinitionId)?.imageUrl ?? null,
        dialogueLine: seatIntro.playerTwoLine,
      },
    ],
    introFirstSpeaker: seatIntro.firstSpeaker,
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
    mediaCatalog,
  );
  const startedAt = Date.now();
  const gameplayStartsAt = startedAt + 4500;
  const turnStartedAt = gameplayStartsAt;
  const turnDeadlineAt = gameplayStartsAt + ONLINE_MATCH_CONFIG.turnTimeLimitSeconds * 1000;

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
        turnStartedAt: new Date(turnStartedAt),
        turnDeadlineAt: new Date(turnDeadlineAt),
         gameplayStartsAt: new Date(gameplayStartsAt),
         startedAt: new Date(startedAt),
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
      turnStartedAt: new Date(turnStartedAt),
      turnDeadlineAt: new Date(turnDeadlineAt),
      gameplayStartsAt: new Date(gameplayStartsAt),
      startedAt: new Date(startedAt),
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
  const existing = await getOpenMatchForUser(userId);
  if (existing && existing.id !== matchId) throw new Error("이미 참가 중인 온라인 매치가 있습니다.");
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

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => structurallyEqual(item, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && structurallyEqual(leftRecord[key], rightRecord[key]));
}

export async function applyMatchAction(
  matchId: string,
  userId: string,
  requestId: string,
  expectedVersion: number,
  payload: OnlineActionPayload,
  connection?: OnlineMatchConnection,
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
    if (!connection && runtime.primaryConnections.has(userId)) {
      return {
        ok: false,
        runtime,
        requestId,
        code: "NOT_PRIMARY_CONNECTION",
        message: "현재 연결된 온라인 세션에서 행동해야 합니다.",
      };
    }
    if (connection && runtime.primaryConnections.get(userId) !== connection) {
      return {
        ok: false,
        runtime,
        requestId,
        code: "NOT_PRIMARY_CONNECTION",
        message: "다른 창에서 이 대전에 접속했습니다.",
      };
    }
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

    if (runtime.state.status === "FINISHED") {
      return { ok: false, runtime, requestId, code: "MATCH_FINISHED", message: "이미 종료된 매치입니다." };
    }
    if (runtime.gameplayStartsAt !== null && Date.now() < runtime.gameplayStartsAt) {
      return { ok: false, runtime, requestId, code: "INTRO_IN_PROGRESS", message: "매치 소개가 끝난 뒤 행동할 수 있습니다." };
    }

    if (
      actionIsNotSurrender(payload) &&
      runtime.turnDeadlineAt !== null &&
      Date.now() >= runtime.turnDeadlineAt &&
      runtime.state.activePlayerId === playerId
    ) {
      await resolveTurnTimeoutLocked(runtime);
      return {
        ok: false,
        runtime,
        requestId,
        code: "TURN_EXPIRED",
        message: "턴 시간이 만료되어 자동으로 턴을 넘겼습니다.",
      };
    }

    const action = toServerAction(payload, playerId);
    if (!action) {
      return { ok: false, runtime, requestId, code: "INVALID_ACTION", message: "알 수 없는 action입니다." };
    }
    if (
      action.type !== "SURRENDER" &&
      (runtime.state.activePlayerId !== playerId ||
        (runtime.state.targetingState?.active && runtime.state.targetingState.playerId !== playerId))
    ) {
      return { ok: false, runtime, requestId, code: "NOT_YOUR_TURN", message: "현재 행동할 수 있는 턴이 아닙니다." };
    }
    const legalActions = action.type === "SURRENDER" ? [action] : getLegalActions(runtime.state, playerId);
    const actionToValidate: GameAction = action.type === "BEGIN_TARGETED_ACTION"
      ? { ...action.action, playerId }
      : action;
    const legal = legalActions.some((candidate) => structurallyEqual(candidate, actionToValidate));
    if (!legal) {
      const code = rejectedActionCode(action, runtime.state, legalActions, playerId);
      return {
        ok: false,
        runtime,
        requestId,
        code,
        message: code === "INVALID_TARGET"
          ? "선택한 대상이 현재 유효하지 않습니다."
          : "현재 상태에서 허용되지 않는 action입니다.",
      };
    }

    const candidateState = structuredClone(runtime.state);
    const result = executeAction(candidateState, action);
    if (!result.success) {
      return { ok: false, runtime, requestId, code: result.errorCode, message: result.message };
    }
    if (directActionStartsTargeting(action, result.state)) {
      return {
        ok: false,
        runtime,
        requestId,
        code: "TARGET_SELECTION_PENDING",
        message: "대상 선택이 필요한 행동은 먼저 BEGIN_TARGETED_ACTION으로 시작해야 합니다.",
      };
    }

    const eventStart = runtime.state.events.length;
    const transition = await commitTransition(runtime, result.state, eventStart);
    runtime.requestIds.set(requestId, {
      userId,
      version: transition.version,
      state: structuredClone(runtime.state),
      eventStart,
    });
    while (runtime.requestIds.size > MAX_REQUEST_CACHE) {
      const oldest = runtime.requestIds.keys().next().value as string | undefined;
      if (!oldest) break;
      runtime.requestIds.delete(oldest);
    }
    return { ok: true, runtime, requestId, version: transition.version, eventStart, duplicate: false };
  });
}

function actionIsNotSurrender(payload: OnlineActionPayload): boolean {
  return payload.type !== "SURRENDER";
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
    serverTime: Date.now(),
    turnStartedAt: execution.runtime.turnStartedAt,
    turnDeadlineAt: execution.runtime.turnDeadlineAt,
    gameplayStartsAt: execution.runtime.gameplayStartsAt,
    publicPlayers: execution.runtime.snapshot.publicPlayers,
    introFirstSpeaker: execution.runtime.snapshot.introFirstSpeaker,
    connectionStates: execution.runtime.connectionStates,
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
    serverTime: Date.now(),
    turnStartedAt: runtime.turnStartedAt,
    turnDeadlineAt: runtime.turnDeadlineAt,
    gameplayStartsAt: runtime.gameplayStartsAt,
    publicPlayers: runtime.snapshot.publicPlayers,
    introFirstSpeaker: runtime.snapshot.introFirstSpeaker,
    connectionStates: runtime.connectionStates,
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
    serverTime: Date.now(),
    turnStartedAt: execution.runtime.turnStartedAt,
    turnDeadlineAt: execution.runtime.turnDeadlineAt,
    gameplayStartsAt: execution.runtime.gameplayStartsAt,
    publicPlayers: execution.runtime.snapshot.publicPlayers,
    introFirstSpeaker: execution.runtime.snapshot.introFirstSpeaker,
    connectionStates: execution.runtime.connectionStates,
  };
}

export function broadcastExecution(execution: Extract<ActionExecution, { ok: true }>): void {
  const cachedUserId = execution.runtime.requestIds.get(execution.requestId)?.userId;
  const recipients = execution.duplicate && cachedUserId
    ? [...execution.runtime.connections].filter((connection) => connection.userId === cachedUserId)
    : [...execution.runtime.connections];
  if (execution.runtime.state.status === "FINISHED") {
    for (const recipient of recipients) {
      recipient.send(endedMessageForViewer(execution, recipient.userId));
    }
    scheduleRuntimeCleanup(execution.runtime);
    return;
  }
  for (const recipient of recipients) {
    recipient.send(messageForViewer(execution, recipient.userId));
  }
}

export function isPrimaryConnection(runtime: OnlineMatchRuntime, connection: OnlineMatchConnection): boolean {
  return runtime.primaryConnections.get(connection.userId) === connection;
}

export function attachConnection(runtime: OnlineMatchRuntime, connection: OnlineMatchConnection): void {
  const previous = runtime.primaryConnections.get(connection.userId);
  if (previous && previous !== connection) {
    previous.send({
      type: "SESSION_REPLACED",
      matchId: runtime.matchId,
      message: "다른 창에서 이 대전에 접속했습니다.",
    });
    runtime.connections.delete(previous);
  }
  runtime.primaryConnections.set(connection.userId, connection);
  runtime.connections.add(connection);
  const seat = matchSeat(runtime, connection.userId);
  if (!seat) return;
  clearDisconnectTimer(runtime, seat);
  delete runtime.disconnectStartedAt[seat];
  delete runtime.reconnectDeadlineAt[seat];
  runtime.connectionStates[seat] = "CONNECTED";
  runRuntimeBackgroundTask(runtime, "connection-state-update", () => withRuntimeLock(runtime, async () => {
    if (runtime.state.status !== "FINISHED") await persistConnectionState(runtime);
    broadcastConnectionStatus(runtime, seat);
  }));
}

export function detachConnection(runtime: OnlineMatchRuntime, connection: OnlineMatchConnection): void {
  runtime.connections.delete(connection);
  if (runtime.primaryConnections.get(connection.userId) === connection) {
    runtime.primaryConnections.delete(connection.userId);
  }
}

export async function markConnectionDisconnected(
  runtime: OnlineMatchRuntime,
  connection: OnlineMatchConnection,
): Promise<void> {
  const seat = matchSeat(runtime, connection.userId);
  if (!seat || runtime.state.status === "FINISHED") return;
  if (runtime.primaryConnections.get(connection.userId) !== connection) return;
  detachConnection(runtime, connection);
  await withRuntimeLock(runtime, async () => {
    if (runtime.state.status === "FINISHED") return;
    if (runtime.primaryConnections.get(connection.userId) !== undefined) return;
    const disconnectedAt = Date.now();
    runtime.connectionStates[seat] = "DISCONNECTED_GRACE";
    runtime.disconnectStartedAt[seat] = disconnectedAt;
    runtime.reconnectDeadlineAt[seat] = disconnectedAt + ONLINE_MATCH_CONFIG.reconnectGraceSeconds * 1000;
    await persistConnectionState(runtime);
    broadcastConnectionStatus(runtime, seat);
    scheduleDisconnectTimers(runtime);
  });
}

function scheduleRuntimeCleanup(runtime: OnlineMatchRuntime): void {
  if (runtime.cleanupTimer) clearTimeout(runtime.cleanupTimer);
  runtime.cleanupTimer = setTimeout(() => cleanupMatchRuntime(runtime.matchId), ONLINE_MATCH_CONFIG.runtimeCleanupGraceMs);
}

export function cleanupMatchRuntime(matchId: string): void {
  const runtime = runtimes.get(matchId);
  if (!runtime) return;
  clearTurnTimer(runtime);
  for (const seat of ["PLAYER_ONE", "PLAYER_TWO"] as const) clearDisconnectTimer(runtime, seat);
  if (runtime.cleanupTimer) clearTimeout(runtime.cleanupTimer);
  runtime.connections.clear();
  runtime.primaryConnections.clear();
  runtime.requestIds.clear();
  runtimes.delete(matchId);
}