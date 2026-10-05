import { recordCompletedDraft } from "./draft-participation-quest";
import { buildMatchRecap } from "@workspace/game-engine";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  cardsTable,
  championsTable,
  draftSettingsTable,
  draftSessionsTable,
  draftParticipantsTable,
  rewardSettingsTable,
  rewardGrantsTable,
  gameMediaTable,
  championIntroInteractionsTable,
} from "@workspace/db";
import {
  DEFAULT_DRAFT_CONFIG,
  parseDraftConfig,
  validateDraftPool,
  prepareDraftSnapshot,
  selectableCards,
  chaosCards,
  selectableChampions,
  draftOffers,
  specialDraftPick,
  ensureDraftCopies,
  beginDraftMutation,
  chooseMutationTarget,
  chooseDraftMutation,
  mutationTargets,
  applyDraftMutation,
  generateCardInstance,
  bestDraftPick,
  cardRecordToDefinition,
  championRecordToDefinition,
  createInitialGameState,
  startGame,
  executeAction,
  createDeterministicRandom,
  completeMinionACatalog,
  getLegalActions,
  validateCardDefinitionReferences,
  type GameMediaCatalog,
  type DraftSnapshot,
  type DraftState,
  type DraftSeat,
  type GameState,
} from "@workspace/game-engine";
import { mapIntroToSeats, resolveChampionIntro } from "../online/intro";
import { expandNamedCardReferences } from "./named-card-references";
import { directActionStartsTargeting } from "../online/action-validation";
import {
  sanitizeGameStateForViewer,
  sequencedEventsForViewer,
} from "../online/sanitizer";
import { toServerAction } from "../online/action-parser";
import { advanceAIOpponent } from "./ai-match-quest-service";
import { grantReward } from "./reward-service";
import { processMatchEventsForDailyQuests } from "./daily-quest-service";
export class DraftError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const record = (value: unknown) => value as Record<string, unknown>;
export async function draftSettings() {
  const [row] = await db
    .select()
    .from(draftSettingsTable)
    .where(eq(draftSettingsTable.id, "global"));
  return {
    enabled: row?.enabled ?? false,
    config: parseDraftConfig(row?.config ?? DEFAULT_DRAFT_CONFIG),
  };
}
export async function draftCatalog(
  config = DEFAULT_DRAFT_CONFIG,
): Promise<DraftSnapshot> {
  const [cards, champions, media, interactions] = await Promise.all([
    db.select().from(cardsTable),
    db.select().from(championsTable),
    db
      .select()
      .from(gameMediaTable)
      .where(eq(gameMediaTable.gameEnabled, true)),
    db.select().from(championIntroInteractionsTable),
  ]);
  return {
    cards: cards.map((c) =>
      cardRecordToDefinition({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      } as unknown as Parameters<typeof cardRecordToDefinition>[0]),
    ),
    champions: champions.map((c) =>
      championRecordToDefinition(
        c as Parameters<typeof championRecordToDefinition>[0],
      ),
    ),
    config,
    media: {
      backgrounds: media.filter((m) => m.mediaType === "BACKGROUND"),
      bgms: media.filter((m) => m.mediaType === "BGM"),
      attackSounds: Object.fromEntries(
        media
          .filter((m) => m.mediaType !== "BACKGROUND" && m.mediaType !== "BGM")
          .map((m) => [m.mediaType, m]),
      ),
    } as GameMediaCatalog,
    interactions,
  };
}
function emptySeat(userId: string | null, name: string): DraftSeat {
  return {
    userId,
    name,
    championId: null,
    deck: [],
    offers: [],
    deadline: null,
    ready: false,
    history: [],
  };
}
function refresh(
  s: DraftState,
  snapshot: DraftSnapshot,
  i: number,
  now: number,
) {
  const seat = s.seats[i];
  seat.specialPick = specialDraftPick(
    snapshot,
    seat,
    `${s.seed}:${i}:special:${seat.deck.length}`,
  );
  seat.lockedOfferId = null;
  seat.offers =
    seat.deck.length === 25
      ? []
      : draftOffers(
          snapshot,
          seat,
          `${s.seed}:${i}:${seat.championId ?? "CHAMPION"}:${seat.deck.length}`,
        );
  seat.deadline =
    s.mode === "PVP"
      ? now +
        1000 *
          (seat.deck.length === 25
            ? snapshot.config.reviewSeconds
            : seat.championId
              ? snapshot.config.pickSeconds
              : snapshot.config.championSeconds)
      : null;
}
function pick(
  s: DraftState,
  snapshot: DraftSnapshot,
  i: number,
  id: string,
  automatic: boolean,
  now: number,
) {
  const seat = s.seats[i];
  if (seat.ready || seat.deck.length === 25 || !seat.offers.includes(id))
    throw new DraftError("INVALID_PICK", "현재 후보에서 카드를 선택해 주세요.");
  if (!seat.championId) seat.championId = id;
  else {
    ensureDraftCopies(seat, `${s.id}:${i}`);
    seat.cards!.push({
      instanceId: `${s.id}:${i}:${seat.deck.length}`,
      definitionId: id,
    });
    seat.deck.push(id);
  }
  seat.history.push({ id, automatic });
  refresh(s, snapshot, i, now);
  if (seat.championId && seat.deck.length)
    beginDraftMutation(snapshot, seat, `${s.seed}:${i}:${seat.deck.length}`);
}
function beginDraft(s: DraftState, snapshot: DraftSnapshot, now: number) {
  s.phase = "DRAFT";
  for (let i = 0; i < 2; i++) refresh(s, snapshot, i, now);
  if (s.mode === "AI") {
    while (s.seats[1].deck.length < 25) {
      pick(s, snapshot, 1, bestDraftPick(snapshot, s.seats[1]), true, now);
      const bot = s.seats[1];
      if (bot.mutationEvent) {
        const target = mutationTargets(snapshot, bot)[0];
        chooseMutationTarget(
          snapshot,
          bot,
          target.instanceId,
          `${s.seed}:1:${bot.deck.length}`,
        );
        if (bot.mutationEvent?.offers[0])
          chooseDraftMutation(bot, bot.mutationEvent.offers[0]);
        else bot.mutationEvent = null;
      }
    }
    s.seats[1].ready = true;
  }
}
function beginBattle(s: DraftState, snapshot: DraftSnapshot, now: number) {
  const required = new Set([
    ...s.seats.flatMap((seat) => seat.deck),
    ...snapshot.cards.filter((c) => c.status === "PUBLISHED").map((c) => c.id),
  ]);
  const allIds = new Set(snapshot.cards.map((c) => c.id));
  const scan = (value: unknown): void => {
    if (typeof value === "string" && allIds.has(value)) {
      required.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(scan);
      return;
    }
    if (value && typeof value === "object") {
      const reference = (value as { definitionRef?: { name?: unknown } })
        .definitionRef;
      if (typeof reference?.name === "string") {
        const exact = snapshot.cards.filter(
          (c) => c.status !== "DISABLED" && c.name === reference.name,
        );
        const matches = exact.length
          ? exact
          : snapshot.cards.filter(
              (c) =>
                c.status !== "DISABLED" &&
                c.name.startsWith(`${reference.name} `),
            );
        if (matches.length === 1) required.add(matches[0].id);
      }
      Object.values(value).forEach(scan);
    }
  };
  s.seats.forEach((seat) =>
    scan(snapshot.champions.find((c) => c.id === seat.championId)),
  );
  let previous = -1;
  while (previous !== required.size) {
    previous = required.size;
    for (const id of required) scan(snapshot.cards.find((c) => c.id === id));
    expandNamedCardReferences(
      snapshot.cards.map((c) => ({
        ...c,
        status: c.status ?? "PUBLISHED",
        effectConfig: c.effectConfig ?? {},
      })),
      required,
    );
  }
  const battleCards = snapshot.cards.filter(
    (c) =>
      c.status === "PUBLISHED" || (c.status === "DRAFT" && required.has(c.id)),
  );
  const initial = createInitialGameState(
    [s.seats[0].championId!, s.seats[1].championId!],
    battleCards,
    snapshot.champions,
    [
      s.seats[0].cards ? [] : s.seats[0].deck,
      s.seats[1].cards ? [] : s.seats[1].deck,
    ],
    {
      gameId: s.id,
      randomSeed: parseInt(s.seed.replaceAll("-", "").slice(0, 8), 16),
      minionACardPool: completeMinionACatalog(
        snapshot.cards.map((c) => ({
          ...c,
          text: c.rulesText,
          effectConfig: c.effectConfig ?? {},
        })),
      ),
    },
  );
  initial.players = initial.players.map((p, i) => ({
    ...p,
    deck:
      s.seats[i].cards?.map((copy) => {
        const definition = battleCards.find((c) => c.id === copy.definitionId)!;
        const card = generateCardInstance(definition, {
          instanceId: copy.instanceId,
          isGenerated: false,
        });
        return copy.mutation ? applyDraftMutation(card, copy.mutation) : card;
      }) ?? p.deck,
    id: i === 0 ? "PLAYER_ONE" : "PLAYER_TWO",
  }));
  s.battle = startGame(
    initial,
    createDeterministicRandom(s.seed),
    snapshot.media,
  );
  s.battle.openingMulligan = true;
  validateCardDefinitionReferences(s.battle);
  s.phase = "BATTLE";
  s.lastSeen = [now, now];
  s.gameplayStartsAt = now + 4500;
  s.turnDeadline = now + 24500;
}
function syncBattle(s: DraftState, old: GameState | null, now: number) {
  if (!s.battle) return;
  if (s.battle.status === "FINISHED") {
    s.phase = "FINISHED";
    s.turnDeadline = null;
    return;
  }
  if (
    old?.activePlayerId !== s.battle.activePlayerId ||
    old?.turn !== s.battle.turn ||
    old?.openingMulligan !== s.battle.openingMulligan
  )
    s.turnDeadline = now + (s.battle.openingMulligan ? 20000 : 90000);
}
function advance(s: DraftState, snapshot: DraftSnapshot, now: number) {
  if (s.phase === "DRAFT" && s.mode === "PVP")
    for (let i = 0; i < 2; i++) {
      const seat = s.seats[i];
      while (!seat.ready && seat.deadline !== null && seat.deadline <= now) {
        const deadline = seat.deadline;
        if (seat.deck.length === 25) {
          seat.ready = true;
          seat.deadline = null;
        } else if (seat.mutationEvent) {
          seat.mutationEvent = null;
          refresh(s, snapshot, i, deadline);
        } else
          pick(s, snapshot, i, bestDraftPick(snapshot, seat), true, deadline);
      }
    }
  if (s.phase === "DRAFT" && s.seats.every((seat) => seat.ready))
    beginBattle(s, snapshot, now);
  if (s.phase === "BATTLE" && s.battle && s.lastSeen) {
    const expired = s.seats.findIndex(
      (seat, i) => seat.userId !== null && now - s.lastSeen![i] > 60000,
    );
    if (expired >= 0) {
      const r = executeAction(s.battle, {
        type: "SURRENDER",
        playerId: expired === 0 ? "PLAYER_ONE" : "PLAYER_TWO",
      });
      if (r.success) {
        s.battle = r.state;
        s.forfeitedSeat = expired;
        syncBattle(s, null, now);
      }
    }
  }
  if (s.phase === "BATTLE" && s.battle && now >= (s.gameplayStartsAt ?? 0)) {
    const old = s.battle;
    if (
      s.battle.openingMulligan &&
      s.mode === "AI" &&
      !s.battle.players[1].mulliganUsed
    ) {
      const r = executeAction(s.battle, {
        type: "MULLIGAN",
        playerId: "PLAYER_TWO",
        cardInstanceIds: s.battle.players[1].hand
          .filter((c) => c.currentCost > 3)
          .map((c) => c.instanceId),
      });
      if (r.success) s.battle = r.state;
    }
    if (s.turnDeadline !== null && s.turnDeadline <= now) {
      if (s.battle.openingMulligan) {
        for (const p of s.battle.players)
          if (!p.mulliganUsed) {
            const r = executeAction(s.battle, {
              type: "MULLIGAN",
              playerId: p.id,
              cardInstanceIds: [],
            });
            if (r.success) s.battle = r.state;
          }
      } else {
        const timed = structuredClone(
          s.battle.targetingState?.playRollback ?? s.battle,
        );
        timed.targetingState = undefined;
        const r = executeAction(timed, {
          type: "END_TURN",
          playerId: s.battle.activePlayerId!,
        });
        if (r.success) s.battle = r.state;
        else {
          const surrender = executeAction(s.battle, {
            type: "SURRENDER",
            playerId: s.battle.activePlayerId!,
          });
          if (surrender.success) s.battle = surrender.state;
        }
      }
    }
    if (s.mode === "AI" && !s.battle.openingMulligan)
      s.battle = advanceAIOpponent(s.battle, "PLAYER_TWO", "NORMAL");
    syncBattle(s, old, now);
  }
}
async function settle(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  s: DraftState,
) {
  if (s.phase !== "FINISHED" || !s.battle?.winnerId) return;
  const settings = await tx.select().from(rewardSettingsTable);
  const prefix = "MATCH_ONLINE";
  for (let i = 0; i < 2; i++) {
    const seat = s.seats[i];
    if (!seat.userId) continue;
    await recordCompletedDraft(seat.userId, s.id, tx);
    const won = s.battle.winnerId === (i === 0 ? "PLAYER_ONE" : "PLAYER_TWO");
    const key = `${prefix}_${won ? "WIN" : "LOSS"}`;
    const setting = settings.find((r) => r.key === key);
    if (
      setting?.enabled &&
      setting.rewardType === "CURRENCY" &&
      setting.amount > 0
    )
      await grantReward(
        {
          userId: seat.userId,
          sourceType: `DRAFT_${won ? "WIN" : "LOSS"}`,
          sourceId: s.id,
          rewardType: "CURRENCY",
          amount: setting.amount,
          metadata: { mode: s.mode },
        },
        tx,
      );
  }
}
async function enabled() {
  if (!(await draftSettings()).enabled)
    throw new DraftError("DRAFT_DISABLED", "드래프트 모드가 OFF입니다.", 503);
}
export async function startDraft(
  userId: string,
  name: string,
  mode: "AI" | "PVP",
  matchmaking = false,
) {
  await enabled();
  const settings = await draftSettings(),
    snapshot = prepareDraftSnapshot(await draftCatalog(settings.config));
  validateDraftPool(snapshot);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('ko:admin-draft'))`,
    );
    const [existing] = await tx
      .select()
      .from(draftParticipantsTable)
      .where(eq(draftParticipantsTable.userId, userId));
    if (existing && matchmaking) return existing.sessionId;
    if (existing)
      throw new DraftError(
        "ACTIVE_DRAFT",
        "진행 중인 드래프트를 먼저 이어서 진행하거나 종료해 주세요.",
        409,
      );
    if (matchmaking && mode === "PVP") {
      const waiting = await tx
        .select()
        .from(draftSessionsTable)
        .where(sql`${draftSessionsTable.state}->>'phase' = 'WAITING'`)
        .orderBy(asc(draftSessionsTable.createdAt))
        .for("update");
      for (const row of waiting) {
        const candidate = structuredClone(row.state) as unknown as DraftState;
        if (
          candidate.mode !== "PVP" ||
          candidate.seats[1].userId ||
          Date.now() - row.updatedAt.getTime() > 60000
        )
          continue;
        candidate.seats[1] = emptySeat(userId, name);
        beginDraft(
          candidate,
          row.snapshot as unknown as DraftSnapshot,
          Date.now(),
        );
        await tx
          .insert(draftParticipantsTable)
          .values({ userId, sessionId: row.id });
        await tx
          .update(draftSessionsTable)
          .set({
            state: record(candidate),
            version: row.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(draftSessionsTable.id, row.id));
        return row.id;
      }
    }
    const s: DraftState = {
      id: randomUUID(),
      mode,
      phase: mode === "AI" ? "DRAFT" : "WAITING",
      seed: randomUUID(),
      seats: [
        emptySeat(userId, name),
        emptySeat(null, mode === "AI" ? "드래프트 AI" : "대기 중"),
      ],
      requests: {},
      battle: null,
      turnDeadline: null,
      gameplayStartsAt: null,
    };
    if (mode === "AI") beginDraft(s, snapshot, Date.now());
    await tx
      .insert(draftSessionsTable)
      .values({ id: s.id, state: record(s), snapshot: record(snapshot) });
    await tx.insert(draftParticipantsTable).values({ userId, sessionId: s.id });
    return s.id;
  });
}
export async function currentDraft(userId: string) {
  const [r] = await db
    .select()
    .from(draftParticipantsTable)
    .where(eq(draftParticipantsTable.userId, userId));
  return r?.sessionId ?? null;
}
export async function mutateDraft(
  userId: string,
  id: string,
  input?: {
    version: number;
    requestId: string;
    type: string;
    pickId?: string;
    action?: unknown;
    name?: string;
  },
  heartbeat = true,
) {
  await enabled();
  return db.transaction(async (tx) => {
    // Independent rooms no longer serialize all polls/actions on one global lock.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`ko:draft:${id}`}))`,
    );
    const [row] = await tx
      .select()
      .from(draftSessionsTable)
      .where(eq(draftSessionsTable.id, id))
      .for("update");
    if (!row)
      throw new DraftError("NOT_FOUND", "드래프트를 찾을 수 없습니다.", 404);
    const s = structuredClone(row.state) as unknown as DraftState,
      snapshot = row.snapshot as unknown as DraftSnapshot;
    snapshot.config = parseDraftConfig(snapshot.config);
    let seat = s.seats.findIndex((p) => p.userId === userId);
    if (input?.type === "JOIN" && s.phase === "WAITING" && seat < 0) {
      const [active] = await tx
        .select()
        .from(draftParticipantsTable)
        .where(eq(draftParticipantsTable.userId, userId));
      if (active)
        throw new DraftError(
          "ACTIVE_DRAFT",
          "이미 진행 중인 드래프트가 있습니다.",
          409,
        );
      seat = 1;
    }
    if (seat < 0)
      throw new DraftError(
        "FORBIDDEN",
        "이 드래프트의 참가자가 아닙니다.",
        403,
      );
    const now = Date.now(),
      before = JSON.stringify({ ...s, lastSeen: undefined });
    const key = input ? `${userId}:${input.requestId}` : null;
    if (input) {
      if (
        !Number.isSafeInteger(input.version) ||
        typeof input.requestId !== "string" ||
        input.requestId.length < 1 ||
        input.requestId.length > 128
      )
        throw new DraftError(
          "INVALID_COMMAND",
          "요청 식별자와 버전이 필요합니다.",
        );
      const signature = JSON.stringify({
        type: input.type,
        pickId: input.pickId,
        action: input.action,
      });
      if (key && s.requests[key]) {
        if (s.requests[key] !== signature)
          throw new DraftError(
            "REQUEST_REUSED",
            "요청 식별자를 다른 명령에 사용할 수 없습니다.",
            409,
          );
        await settle(tx, s);
        return { state: s, snapshot, version: row.version, seat };
      }
      if (input.version !== row.version)
        throw new DraftError(
          "STALE_VERSION",
          "진행 상태가 변경됐습니다. 다시 불러와 주세요.",
          409,
        );
      const commandSeat = structuredClone(s.seats[seat]);
      const commandBattle = s.battle?.turn;
      const commandMulligan = s.battle?.openingMulligan;
      advance(s, snapshot, now);
      if (
        [
          "PICK",
          "REROLL",
          "LOCK",
          "MUTATION_TARGET",
          "MUTATION_PICK",
          "MUTATION_SKIP",
        ].includes(input.type) &&
        (commandSeat.deck.length !== s.seats[seat].deck.length ||
          commandSeat.championId !== s.seats[seat].championId ||
          Boolean(commandSeat.mutationEvent) !==
            Boolean(s.seats[seat].mutationEvent))
      )
        throw new DraftError(
          "PICK_EXPIRED",
          "선택 시간이 끝났습니다. 최신 상태를 다시 불러와 주세요.",
          409,
        );
      if (
        input.type === "ACTION" &&
        (commandBattle !== s.battle?.turn ||
          commandMulligan !== s.battle?.openingMulligan)
      )
        throw new DraftError(
          "TURN_EXPIRED",
          "전투 상태가 변경됐습니다. 최신 상태를 다시 불러와 주세요.",
          409,
        );
      if (input.type === "JOIN") {
        if (s.phase !== "WAITING" || s.seats[0].userId === userId)
          throw new DraftError(
            "INVALID_PHASE",
            "참가할 수 없는 드래프트입니다.",
          );
        s.seats[1] = emptySeat(userId, input.name ?? "관리자");
        await tx
          .insert(draftParticipantsTable)
          .values({ userId, sessionId: id });
        beginDraft(s, snapshot, now);
      } else if (
        [
          "REROLL",
          "LOCK",
          "MUTATION_TARGET",
          "MUTATION_PICK",
          "MUTATION_SKIP",
        ].includes(input.type)
      ) {
        const own = s.seats[seat];
        if (
          s.phase !== "DRAFT" ||
          !own.championId ||
          own.ready ||
          own.deck.length === 25
        )
          throw new DraftError("INVALID_PHASE", "현재 선택 단계가 아닙니다.");
        ensureDraftCopies(own, `${s.id}:${seat}`);
        if (input.type === "MUTATION_TARGET")
          chooseMutationTarget(
            snapshot,
            own,
            input.pickId ?? "",
            `${s.seed}:${seat}:${own.deck.length}`,
          );
        else if (input.type === "MUTATION_PICK") {
          chooseDraftMutation(own, input.pickId ?? "");
          refresh(s, snapshot, seat, now);
        } else if (input.type === "MUTATION_SKIP") {
          if (!own.mutationEvent)
            throw new DraftError("INVALID_PHASE", "개조 단계가 아닙니다.");
          own.mutationEvent = null;
          refresh(s, snapshot, seat, now);
        } else {
          if (own.mutationEvent)
            throw new DraftError(
              "INVALID_PHASE",
              "카드 개조를 먼저 마쳐 주세요.",
            );
          if (input.type === "LOCK") {
            if (input.pickId && !own.offers.includes(input.pickId))
              throw new DraftError(
                "INVALID_PICK",
                "잠금 후보를 확인해 주세요.",
              );
            own.lockedOfferId =
              own.lockedOfferId === input.pickId
                ? null
                : (input.pickId ?? null);
          } else {
            if ((own.rerollsUsed ?? 0) >= snapshot.config.rerollCount)
              throw new DraftError("NO_REROLLS", "남은 리롤이 없습니다.");
            own.rerollsUsed = (own.rerollsUsed ?? 0) + 1;
            own.offers = draftOffers(
              snapshot,
              own,
              `${s.seed}:${seat}:${own.deck.length}:reroll:${own.rerollsUsed}`,
            );
          }
        }
      } else if (input.type === "PICK") {
        if (s.phase !== "DRAFT")
          throw new DraftError(
            "INVALID_PHASE",
            "카드를 선택할 단계가 아닙니다.",
          );
        if (s.seats[seat].mutationEvent)
          throw new DraftError(
            "INVALID_PHASE",
            "카드 개조를 먼저 마쳐 주세요.",
          );
        pick(s, snapshot, seat, input.pickId ?? "", false, now);
      } else if (input.type === "READY") {
        if (s.phase !== "DRAFT" || s.seats[seat].deck.length !== 25)
          throw new DraftError(
            "INVALID_PHASE",
            "25장을 선택한 후 준비해 주세요.",
          );
        s.seats[seat].ready = true;
        s.seats[seat].deadline = null;
      } else if (input.type === "ABORT") {
        if (s.phase === "BATTLE") {
          const r = executeAction(s.battle!, {
            type: "SURRENDER",
            playerId: seat === 0 ? "PLAYER_ONE" : "PLAYER_TWO",
          });
          if (r.success) s.battle = r.state;
          syncBattle(s, null, now);
        } else if (s.phase !== "FINISHED") {
          s.phase = "ABORTED";
        }
      } else if (input.type === "ACTION") {
        if (s.phase !== "BATTLE" || !s.battle)
          throw new DraftError("INVALID_PHASE", "진행 중인 전투가 없습니다.");
        if (now < (s.gameplayStartsAt ?? 0))
          throw new DraftError(
            "INTRO_PENDING",
            "챔피언 소개가 끝난 후 진행해 주세요.",
          );
        const action = toServerAction(
          input.action,
          seat === 0 ? "PLAYER_ONE" : "PLAYER_TWO",
        );
        if (!action)
          throw new DraftError("INVALID_ACTION", "전투 명령을 확인해 주세요.");
        if (
          !["SURRENDER", "EMOTE", "MULLIGAN"].includes(action.type) &&
          s.battle.activePlayerId !== action.playerId
        )
          throw new DraftError(
            "NOT_YOUR_TURN",
            "현재 행동할 수 있는 턴이 아닙니다.",
          );
        const comparable =
          action.type === "BEGIN_TARGETED_ACTION"
            ? { ...action.action, playerId: action.playerId }
            : action;
        if (
          !["SURRENDER", "EMOTE"].includes(action.type) &&
          !getLegalActions(s.battle, action.playerId).some((a) =>
            action.type === "MULLIGAN"
              ? a.type === "MULLIGAN"
              : isDeepStrictEqual(a, comparable),
          )
        )
          throw new DraftError(
            "INVALID_ACTION",
            "현재 허용되지 않는 행동입니다.",
          );
        const old = s.battle,
          r = executeAction(s.battle, action);
        if (!r.success) throw new DraftError(r.errorCode, r.message);
        if (directActionStartsTargeting(action, r.state))
          throw new DraftError(
            "TARGET_SELECTION_PENDING",
            "대상 선택부터 시작해 주세요.",
          );
        s.battle = r.state;
        syncBattle(s, old, now);
      } else
        throw new DraftError(
          "INVALID_COMMAND",
          "지원하지 않는 드래프트 명령입니다.",
        );
      if (key) s.requests[key] = signature;
    }
    advance(s, snapshot, now);
    await settle(tx, s);
    const oldBattle = (row.state as unknown as DraftState).battle;
    if (s.battle && s.battle.events.length > (oldBattle?.events.length ?? 0))
      for (let i = 0; i < 2; i++) {
        const participant = s.seats[i];
        if (participant.userId)
          await processMatchEventsForDailyQuests(
            participant.userId,
            i === 0 ? "PLAYER_ONE" : "PLAYER_TWO",
            s.id,
            s.battle,
            oldBattle?.events.length ?? 0,
            tx,
          );
      }
    const changed = before !== JSON.stringify({ ...s, lastSeen: undefined }),
      version = row.version + (changed ? 1 : 0);
    if (heartbeat && s.phase === "BATTLE" && s.lastSeen) s.lastSeen[seat] = now;
    if (
      changed ||
      (heartbeat && (s.phase === "BATTLE" || s.phase === "WAITING"))
    )
      await tx
        .update(draftSessionsTable)
        .set({ state: record(s), version, updatedAt: new Date() })
        .where(eq(draftSessionsTable.id, id));
    else if (heartbeat && s.phase === "BATTLE" && s.lastSeen)
      await tx
        .update(draftSessionsTable)
        .set({
          state: sql`jsonb_set(${draftSessionsTable.state}, '{lastSeen}', ${JSON.stringify(s.lastSeen)}::jsonb)`,
          updatedAt: new Date(),
        })
        .where(eq(draftSessionsTable.id, id));
    if (s.phase === "FINISHED" || s.phase === "ABORTED")
      await tx
        .delete(draftParticipantsTable)
        .where(eq(draftParticipantsTable.sessionId, id));
    return { state: s, snapshot, version, seat };
  });
}
export type DraftResult = Awaited<ReturnType<typeof mutateDraft>>;
export function draftView(r: DraftResult) {
  const own = r.state.seats[r.seat],
    enemy = r.state.seats[1 - r.seat];
  const ended = r.state.phase === "FINISHED";
  return {
    id: r.state.id,
    mode: r.state.mode,
    phase: r.state.phase,
    version: r.version,
    serverTime: Date.now(),
    seat: r.seat,
    own,
    opponent: {
      name: enemy.name,
      picks: enemy.deck.length,
      ready: enemy.ready,
      ...(ended ? { deck: enemy.deck, championId: enemy.championId } : {}),
    },
    cards: [
      ...new Map(
        [
          ...selectableCards(r.snapshot),
          ...chaosCards(r.snapshot).filter(
            (c) =>
              own.deck.includes(c.id) ||
              own.offers.includes(c.id) ||
              (ended && enemy.deck.includes(c.id)),
          ),
        ].map((c) => [c.id, c]),
      ).values(),
    ],
    champions: selectableChampions(r.snapshot),
    config: r.snapshot.config,
    recap: ended && r.state.battle ? buildMatchRecap(r.state.battle) : null,
    result:
      ended && r.state.battle
        ? {
            won:
              r.state.battle.winnerId ===
              (r.seat === 0 ? "PLAYER_ONE" : "PLAYER_TWO"),
            winnerName:
              r.state.seats[r.state.battle.winnerId === "PLAYER_TWO" ? 1 : 0]
                .name,
            turns: r.state.battle.turn,
            highlights: [...r.state.battle.events]
              .filter(
                (e) =>
                  e.type === "CHAMPION_QUEST_COMPLETED" ||
                  (e.type === "DAMAGE_DEALT" && (e.amount ?? 0) > 0),
              )
              .sort((a, b) => (b.amount ?? 1000) - (a.amount ?? 1000))
              .slice(0, 3)
              .map(
                (e) =>
                  `${r.state.seats[e.playerId === "PLAYER_TWO" ? 1 : 0].name}: ${e.type === "CHAMPION_QUEST_COMPLETED" ? "챔피언 퀘스트 완료" : `${e.amount} 피해`}`,
              ),
          }
        : null,
  };
}
export function draftBattleView(r: DraftResult) {
  const s = r.state;
  if (!s.battle)
    throw new DraftError("INVALID_PHASE", "아직 전투가 시작되지 않았습니다.");
  const first = r.snapshot.champions.find(
      (c) => c.id === s.seats[0].championId,
    )!,
    second = r.snapshot.champions.find((c) => c.id === s.seats[1].championId)!;
  const intro = mapIntroToSeats(
    first.id,
    second.id,
    resolveChampionIntro(first, second, r.snapshot.interactions ?? []),
  );
  return {
    recap: s.battle.status === "FINISHED" ? buildMatchRecap(s.battle) : null,
    type: "MATCH_SNAPSHOT",
    matchId: s.id,
    seat: r.seat === 0 ? "PLAYER_ONE" : "PLAYER_TWO",
    version: r.version,
    state: sanitizeGameStateForViewer(
      s.battle,
      r.seat === 0 ? "PLAYER_ONE" : "PLAYER_TWO",
    ),
    events: sequencedEventsForViewer(
      s.battle,
      r.seat === 0 ? "PLAYER_ONE" : "PLAYER_TWO",
      s.battle.events,
    ),
    serverTime: Date.now(),
    turnStartedAt: s.turnDeadline
      ? s.turnDeadline - (s.battle.openingMulligan ? 20000 : 90000)
      : null,
    turnDeadlineAt: s.turnDeadline,
    gameplayStartsAt: s.gameplayStartsAt,
    publicPlayers: s.seats.map((seat, i) => {
      const c = r.snapshot.champions.find((c) => c.id === seat.championId)!;
      return {
        seat: i === 0 ? "PLAYER_ONE" : "PLAYER_TWO",
        displayName: seat.name,
        championDefinitionId: c.id,
        championName: c.name,
        portraitUrl: c.imageUrl ?? null,
        dialogueLine: i === 0 ? intro.playerOneLine : intro.playerTwoLine,
      };
    }),
    introFirstSpeaker: intro.firstSpeaker,
    connectionStates: Object.fromEntries(
      s.seats.map((seat, i) => [
        i === 0 ? "PLAYER_ONE" : "PLAYER_TWO",
        s.forfeitedSeat === i
          ? "FORFEITED"
          : seat.userId && s.lastSeen && Date.now() - s.lastSeen[i] > 10000
            ? "DISCONNECTED_GRACE"
            : "CONNECTED",
      ]),
    ),
  };
}
export async function draftRewards(userId: string, id: string) {
  const r = await mutateDraft(userId, id);
  const grants = await db
    .select()
    .from(rewardGrantsTable)
    .where(
      and(
        eq(rewardGrantsTable.userId, userId),
        eq(rewardGrantsTable.sourceId, id),
        inArray(rewardGrantsTable.sourceType, ["DRAFT_WIN", "DRAFT_LOSS"]),
      ),
    );
  const prefix = "MATCH_ONLINE";
  const settings = await db.select().from(rewardSettingsTable);
  return {
    status: r.state.phase === "FINISHED" ? "ENDED" : "CANCELLED",
    rewardEnabled: settings.some((s) => s.key.startsWith(prefix) && s.enabled),
    grants,
  };
}

// Persisted deadlines are processed even when both draft clients are disconnected.
export async function tickDraftSessions() {
  if (!(await draftSettings()).enabled) return;
  const participants = await db.select().from(draftParticipantsTable);
  const seen = new Set<string>();
  for (const p of participants) {
    if (seen.has(p.sessionId)) continue;
    seen.add(p.sessionId);
    await mutateDraft(p.userId, p.sessionId, undefined, false);
  }
}
export function startDraftWorker() {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void tickDraftSessions()
      .catch((error) => console.error("[KO draft timer]", error))
      .finally(() => {
        running = false;
      });
  }, 1000);
  timer.unref();
  return () => clearInterval(timer);
}
