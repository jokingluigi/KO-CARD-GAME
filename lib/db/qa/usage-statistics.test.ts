import { executeUsageObservedAction as executeAction } from "../../../artifacts/api-server/src/lib/usage-statistics-observer";
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as schema from "../src/schema";
import { sql, eq } from "drizzle-orm";
import {
  createInitialGameState,
  startGame,
  type GameState,
  type CardDefinition,
  type ChampionDefinition,
} from "../../game-engine/src/index";
import {
  summarizeUsage,
  type UsageStart,
  type UsageSummary,
} from "../../../artifacts/api-server/src/lib/usage-statistics-events";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.NODE_ENV = "development";
const pg = new PGlite(),
  database = drizzle(pg, { schema });
for (const ddl of await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson(schema),
))
  await pg.exec(ddl);
const migration = await readFile(
  new URL("../migrations/0052_usage_statistics.sql", import.meta.url),
  "utf8",
);
await pg.exec(migration);
await pg.exec(migration);
await pg.exec(
  await readFile(
    new URL("../migrations/0033_server_maintenance.sql", import.meta.url),
    "utf8",
  ),
);
const { db, pool } = await import("../src/index");
for (const method of [
  "select",
  "insert",
  "update",
  "delete",
  "transaction",
  "execute",
] as const)
  Object.assign(db, { [method]: database[method].bind(database) });
const { ingestUsage, collectUsageBatch, queryRows } =
  await import("../../../artifacts/api-server/src/lib/usage-statistics-store");
const { statisticsQuery, readUsageStatistics } =
  await import("../../../artifacts/api-server/src/lib/usage-statistics-query");
const { saveAIQuestStart, processStoredAIQuestMatch } =
  await import("../../../artifacts/api-server/src/lib/ai-quest-match-storage");
const { replayAIMatch } =
  await import("../../../artifacts/api-server/src/lib/ai-match-quest-service");
await pg.exec(`UPDATE usage_collection SET started_at='2026-01-01T00:00:00Z'`);
const users = ["admin", "user-a", "user-b", "excluded", "test"];
await database.insert(schema.usersTable).values(
  users.map((id) => ({
    id,
    email:
      id === "test"
        ? "ko-test-user@localhost.test"
        : id + "@statistics.invalid",
    nickname: id,
    passwordHash: "unused",
    role: id === "admin" ? ("ADMIN" as const) : ("USER" as const),
  })),
);
await pg.exec(
  `INSERT INTO usage_excluded_accounts VALUES ('excluded','local automated QA')`,
);
const unit: CardDefinition = {
  id: "stats-unit",
  name: "통계 검증 선수",
  cardType: "WRESTLER",
  cost: 0,
  attack: 1,
  health: 2,
  rulesText: "",
  isToken: false,
  isChampionToken: false,
  rarity: "NORMAL",
  keywords: [],
  abilities: [],
};
const token: CardDefinition = {
  ...unit,
  id: "stats-token",
  name: "비공개 토큰",
  isToken: true,
  status: "DRAFT",
};
const spawner: CardDefinition = {
  ...unit,
  id: "stats-spawner",
  name: "토큰 생성 선수",
  abilities: [
    {
      trigger: "ENTER_FIELD",
      effects: [
        {
          type: "STRUCTURED",
          action: "SUMMON",
          values: { definition: token, count: 1 },
        },
      ],
    },
  ],
};
const spell: CardDefinition = {
  ...unit,
  id: "stats-spell",
  name: "대상 지정 주문",
  cardType: "TECHNIQUE",
  abilities: [
    {
      trigger: "ACTIVE",
      effects: [
        {
          type: "STRUCTURED",
          action: "BUFF",
          target: {
            zone: "BOARD",
            owner: "SELF",
            selection: "PLAYER_CHOICE",
            count: 1,
          },
          values: { attack: 1, health: 0 },
        },
      ],
    },
  ],
};
const hero: ChampionDefinition = {
  id: "stats-hero",
  name: "통계 검증 챔피언",
  maxHealth: 30,
  ability: {
    id: "stats-power",
    name: "고유 능력",
    description: "골드 1 획득",
    cost: 0,
    effects: [{ type: "GAIN_GOLD", amount: 1 }],
  },
  quest: {
    id: "stats-quest",
    name: "검증 퀘스트",
    description: "선수 1장 플레이",
    trackedEvent: "CARD_PLAYED",
    cardType: "WRESTLER",
    requiredProgress: 1,
    reward: { type: "GAIN_GOLD", amount: 1 },
  },
  upgradedAbility: null,
};
const vanilla: ChampionDefinition = {
  ...hero,
  id: "stats-vanilla",
  name: "퀘스트 없는 챔피언",
  quest: null,
};
const fillers = Array.from({ length: 21 }, (_, i) => ({
  ...unit,
  id: "stats-filler-" + i,
  name: "일반 선수 " + i,
}));
const poolCards = [unit, token, spawner, spell, ...fillers],
  deck = [unit.id, unit.id, spawner.id, spell.id, ...fillers.map((c) => c.id)];
await database.insert(schema.cardsTable).values(
  poolCards.map((c) => ({
    id: c.id,
    name: c.name,
    cardType: c.cardType,
    rarity: "NORMAL",
    cost: c.cost,
    attack: c.attack,
    health: c.health,
    text: c.rulesText,
    status: c.status ?? "PUBLISHED",
    isToken: c.isToken,
  })),
);
await database.insert(schema.championsTable).values(
  [
    hero,
    vanilla,
    { ...hero, id: "stats-unplayed-quest", name: "미선택 퀘스트 챔피언" },
  ].map((c) => ({
    id: c.id,
    name: c.name,
    abilityName: c.ability.name,
    abilityCost: 0,
    abilityText: c.ability.description,
    abilityEffects: {},
    hasQuest: Boolean(c.quest),
    questText: c.quest?.description,
    questRewardText: "골드 1",
    status: "PUBLISHED",
  })),
);
const now = new Date("2026-10-16T12:00:00Z");
function initial(id = "stats-match") {
  let state = startGame(
    createInitialGameState(
      [hero.id, vanilla.id],
      poolCards,
      [hero, vanilla],
      [deck, deck],
      { gameId: id, randomSeed: 12 },
    ),
    () => 0.5,
  );
  // Deterministic scenario arrangement only. Counts are observed exclusively from executeAction.
  state = {
    ...state,
    activePlayerId: state.players[0]!.id,
    players: state.players.map((p, i) => ({
      ...p,
      currentGold: 6,
      hand: i === 0 ? [...p.hand, ...p.deck] : p.hand,
      deck: i === 0 ? [] : p.deck,
    })),
  };
  return state;
}
function action(state: GameState, payload: Record<string, unknown>) {
  const result = executeAction(state, payload as never);
  assert.equal(result.success, true, result.message);
  return result.state;
}
function scenario(id = "stats-match") {
  let state = initial(id);
  const seat = state.players[0]!.id;
  const use = (definitionId: string) => {
    const c = state.players[0]!.hand.find(
      (c) => c.definitionId === definitionId,
    )!;
    state = action(state, {
      type: c.cardType === "TECHNIQUE" ? "PLAY_TECHNIQUE" : "PLAY_WRESTLER",
      playerId: seat,
      cardInstanceId: c.instanceId,
      boardSlot: state.players[0]!.board.findIndex((c) => !c),
    });
  };
  use(unit.id);
  use(unit.id);
  use(spawner.id);
  state = action(state, { type: "END_TURN", playerId: seat });
  state = action(state, { type: "END_TURN", playerId: state.players[1]!.id });
  state = action(state, { type: "USE_CHAMPION_ABILITY", playerId: seat });
  const beforeSpell = state;
  use(spell.id);
  assert.ok(state.targetingState?.active);
  state = action(state, { type: "CANCEL_EFFECT_TARGET", playerId: seat });
  assert.equal(
    state.players[0]!.currentGold,
    beforeSpell.players[0]!.currentGold,
  );
  const failed = executeAction(state, {
    type: "PLAY_WRESTLER",
    playerId: seat,
    cardInstanceId: "missing",
    boardSlot: 0,
  });
  assert.equal(failed.success, false);
  assert.deepEqual(failed.state, state);
  state = action(state, { type: "SURRENDER", playerId: state.players[1]!.id });
  const start: UsageStart = {
    version: 1,
    startedAt: "2026-10-16T11:00:00Z",
    decks: { [seat]: deck, [state.players[1]!.id]: deck },
  };
  return { state, start, summary: summarizeUsage(state, start, now)! };
}
let sample: ReturnType<typeof scenario>;
test("additive migration is repeatable, protected and indexed without catalog mutation", async () => {
  assert.equal(
    (await database.select().from(schema.cardsTable)).length,
    poolCards.length,
  );
  const r = await pg.query<{ relrowsecurity: boolean }>(
    `SELECT relrowsecurity FROM pg_class WHERE relname='usage_participations'`,
  );
  assert.equal(r.rows[0]?.relrowsecurity, true);
  const idx = await pg.query(
    `SELECT indexname FROM pg_indexes WHERE tablename LIKE 'usage_%'`,
  );
  assert.ok(idx.rows.length >= 10);
});
test("actual engine PLAY, token generation, ability, quest and cancellation produce trustworthy counters", () => {
  sample = scenario();
  const p = sample.summary.participants[0]!;
  assert.equal(p.cards.find((c) => c.id === unit.id)?.deckCopies, 2);
  assert.equal(p.cards.find((c) => c.id === unit.id)?.plays, 2);
  assert.equal(p.cards.find((c) => c.id === spawner.id)?.plays, 1);
  assert.equal(p.cards.find((c) => c.id === token.id)?.generated, 1);
  assert.equal(p.cards.find((c) => c.id === token.id)?.summons, 1);
  assert.equal(p.cards.find((c) => c.id === token.id)?.plays, 0);
  assert.equal(p.cards.find((c) => c.id === spell.id)?.plays, 0);
  assert.equal(p.abilityUses, 1);
  assert.equal(p.questCompleted, true);
  assert.equal(
    p.questTurn,
    sample.state.events.find((e) => e.type === "CHAMPION_QUEST_COMPLETED")!
      .turn,
  );
  assert.equal(sample.summary.unresolvedEvents, 0);
  assert.equal(summarizeUsage(initial(), sample.start), null);
});
test("AI/NPC unbound seats excluded; real AI-opponent user side included", async () => {
  await ingestUsage("ai:engine", sample.summary, { "player-1": "user-a" });
  const rows = await queryRows(
    database,
    sql`SELECT * FROM usage_participations`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.outcome, "WIN");
});
test("duplicate finish, reconnect, retry and restart leave exact totals unchanged", async () => {
  assert.equal(
    await ingestUsage("ai:engine", structuredClone(sample.summary), {
      "player-1": "user-a",
    }),
    false,
  );
  assert.equal(
    await ingestUsage("ai:engine", sample.summary, { "player-1": "user-a" }),
    false,
  );
  const [r] = await queryRows(
    database,
    sql`SELECT SUM(plays)::int AS n FROM usage_card_daily`,
  );
  assert.equal(r!.n, 3);
});
test("reserved and explicitly excluded test accounts, diagnostic games do not contribute", async () => {
  for (const who of ["test", "excluded"])
    await ingestUsage("excluded:" + who, sample.summary, { "player-1": who });
  await ingestUsage(
    "diagnostic",
    { ...sample.summary, diagnostic: true },
    { "player-1": "admin" },
  );
  assert.equal(
    (await queryRows(database, sql`SELECT * FROM usage_participations`)).length,
    1,
  );
});
test("ordinary administrator play is included and does not inherit diagnostic exclusion", async () => {
  await ingestUsage("real-admin", sample.summary, { "player-1": "admin" });
  assert.equal(
    (await queryRows(database, sql`SELECT * FROM usage_participations`)).length,
    2,
  );
});
test("two PvP real participants count separately; missing deck is never guessed", async () => {
  const s = structuredClone(sample.summary);
  s.participants[1]!.deckKnown = false;
  s.participants[1]!.cards = [];
  await ingestUsage("pvp:engine", s, {
    "player-1": "user-a",
    "player-2": "user-b",
  });
  const d = await readUsageStatistics(
    "cards",
    statisticsQuery({ period: "all" }),
    unit.id,
    database,
    now,
  );
  assert.equal(d.totals.participants, 4);
  assert.equal(d.totals.knownDecks, 3);
  assert.equal(d.detail!.adoptions, 3);
  assert.equal(d.detail!.copies, 6);
  assert.equal(d.detail!.plays, 6);
  assert.equal(d.detail!.users, 2);
  assert.equal(d.detail!.adoptionRate, 100);
  assert.equal(d.detail!.playRate, 75);
  assert.equal(d.detail!.winRate, 100);
});
test("draws, losses and quest-completed/incomplete samples have distinct denominators", async () => {
  const s = structuredClone(sample.summary);
  s.participants[0]!.outcome = "LOSS";
  s.participants[0]!.questCompleted = false;
  s.participants[0]!.questTurn = null;
  await ingestUsage("loss", s, { "player-1": "user-a" });
  s.participants[0]!.outcome = "DRAW";
  await ingestUsage("draw", s, { "player-1": "user-a" });
  const d = await readUsageStatistics(
    "champions",
    statisticsQuery({ period: "30" }),
    hero.id,
    database,
    now,
  );
  assert.equal(d.detail!.selections, 5);
  assert.equal(d.detail!.samples, 4);
  assert.equal(d.detail!.winRate, 75);
  assert.equal(d.detail!.draws, 1);
  assert.equal(d.detail!.questRate, 60);
  assert.equal(
    d.detail!.averageQuestTurn,
    sample.summary.participants[0]!.questTurn,
  );
  assert.equal(d.detail!.completedSamples, 3);
  assert.equal(d.detail!.incompleteSamples, 1);
  assert.equal(d.detail!.completedWinRate, 100);
  assert.equal(d.detail!.incompleteWinRate, 0);
  assert.equal(d.detail!.users, 2);
});
test("no quest, no games and no baseline return null rather than invented percentages", async () => {
  const d = await readUsageStatistics(
    "champions",
    statisticsQuery({}),
    vanilla.id,
    database,
    now,
  );
  const unplayed = await readUsageStatistics(
    "champions",
    statisticsQuery({}),
    "stats-unplayed-quest",
    database,
    now,
  );
  assert.equal(unplayed.detail!.hasQuest, true);
  assert.equal(unplayed.detail!.questRate, null);
  assert.equal(unplayed.detail!.selections, 0);
  assert.equal(d.detail!.questRate, null);
  assert.equal(d.detail!.averageQuestTurn, null);
  assert.equal(d.detail!.winRate, 0);
  const absent = await readUsageStatistics(
    "cards",
    statisticsQuery({}),
    fillers[0]!.id,
    database,
    now,
  );
  assert.equal(absent.detail!.playRate, 0);
  assert.equal(absent.detail!.users, 0);
});
test("UTC day boundaries, 7/30/90/all filters and exact multi-day distinct users", async () => {
  for (const [key, date] of [
    ["boundary", "2026-10-10T00:00:00Z"],
    ["old", "2026-09-16T23:59:59Z"],
  ] as const) {
    await ingestUsage(
      key,
      { ...sample.summary, startedAt: "2026-09-01T00:00:00Z", endedAt: date },
      { "player-1": "user-a" },
    );
  }
  const seven = await readUsageStatistics(
    "cards",
    statisticsQuery({ period: "7" }),
    unit.id,
    database,
    now,
  );
  assert.equal(seven.detail!.adoptions, 6);
  assert.equal(seven.detail!.users, 2);
  assert.equal(seven.daily.length, 2);
  const thirty = await readUsageStatistics(
    "cards",
    statisticsQuery({ period: "30" }),
    unit.id,
    database,
    now,
  );
  assert.equal(thirty.detail!.adoptions, 6);
  const ninety = await readUsageStatistics(
    "cards",
    statisticsQuery({ period: "90" }),
    unit.id,
    database,
    now,
  );
  assert.equal(ninety.detail!.adoptions, 7);
  assert.equal(ninety.detail!.users, 2);
  const all = await readUsageStatistics(
    "cards",
    statisticsQuery({ period: "all" }),
    unit.id,
    database,
    now,
  );
  assert.equal(all.detail!.adoptions, 7);
  assert.equal(all.detail!.users, 2);
});
test("same stable card ID survives rename and deletion without restoring content", async () => {
  await database
    .update(schema.cardsTable)
    .set({ name: "이름 변경 선수" })
    .where(eq(schema.cardsTable.id, unit.id));
  let d = await readUsageStatistics(
    "cards",
    statisticsQuery({ q: "이름 변경" }),
    undefined,
    database,
    now,
  );
  assert.equal(d.items[0]!.id, unit.id);
  assert.ok(d.items[0]!.plays > 0);
  await database
    .delete(schema.cardsTable)
    .where(eq(schema.cardsTable.id, token.id));
  d = await readUsageStatistics(
    "cards",
    statisticsQuery({}),
    token.id,
    database,
    now,
  );
  assert.equal(d.detail!.generated, 6);
  assert.match(d.detail!.name, /삭제된 콘텐츠/);
});
test("SQL injection and invalid query shapes cannot select arbitrary columns or windows", () => {
  for (const bad of [
    { period: "1;DROP TABLE users" },
    { page: -1 },
    { page: "1.5" },
    { q: ["a"] },
    { sort: "email" },
    { direction: "DROP" },
  ])
    assert.throws(() => statisticsQuery(bad));
  assert.equal(statisticsQuery({}).period, "30");
});
test("unresolvable event IDs roll back source claim and can be safely retried", async () => {
  await assert.rejects(
    ingestUsage(
      "bad",
      { ...sample.summary, unresolvedEvents: 1 },
      { "player-1": "user-a" },
    ),
  );
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT * FROM usage_processed_sources WHERE source_key='bad'`,
      )
    ).length,
    0,
  );
});
let origin = "",
  server: import("node:http").Server;
const cookies: Record<string, string> = {};
test("real HTTP auth setup and administrator-only API, no ingestion POST endpoint", async () => {
  const { default: app } =
    await import("../../../artifacts/api-server/src/app");
  app.get("/api/qa-stat-assets/:asset", (req, res) => {
    if (!["card.webp", "champion.webp"].includes(req.params.asset)) {
      res.sendStatus(404);
      return;
    }
    res.sendFile(
      new URL(
        "../../../docs/qa/admin-usage-statistics-20261016/fixtures/" +
          req.params.asset,
        import.meta.url,
      ).pathname,
    );
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  origin = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  for (const id of ["admin", "user-a"]) {
    const token = "local-statistics-" + id;
    await database.insert(schema.sessionsTable).values({
      id: "session-" + id,
      userId: id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3600000),
    });
    cookies[id] = "ko_session=" + token;
  }
  for (const [cookie, status] of [
    ["", 401],
    [cookies["user-a"]!, 403],
    [cookies.admin!, 200],
  ] as const) {
    const r = await fetch(origin + "/api/admin/usage-statistics/cards", {
      headers: { cookie },
    });
    assert.equal(r.status, status);
    if (status === 200) {
      assert.match(r.headers.get("cache-control") ?? "", /no-store/);
      const body = await r.text();
      assert.doesNotMatch(body, /@statistics|subject_key|password|tokenHash/);
    }
  }
  const status = await fetch(origin + "/api/admin/usage-statistics/status", {
    headers: { cookie: cookies.admin! },
  });
  assert.equal(status.status, 200);
  const health = await status.json();
  assert.equal(health.privacy.statistics.tables, 12);
  assert.equal(health.privacy.statistics.protected, 12);
  assert.equal(health.privacy.sources.length, 4);
  assert.ok(health.privacy.sources.every((s: any) => s.rls));
  assert.equal(
    (
      await fetch(origin + "/api/admin/usage-statistics/cards", {
        method: "POST",
        headers: { cookie: cookies.admin!, "Content-Type": "application/json" },
        body: JSON.stringify({ plays: 999999 }),
      })
    ).status,
    404,
  );
});
test("administrator API rejects malformed parameters and supports search, details and pagination", async () => {
  for (const query of ["period=999", "page=NaN", "sort=email", "q[x]=bad"])
    assert.equal(
      (
        await fetch(origin + "/api/admin/usage-statistics/cards?" + query, {
          headers: { cookie: cookies.admin! },
        })
      ).status,
      400,
    );
  const r = await fetch(
    origin + "/api/admin/usage-statistics/cards/" + unit.id + "?period=all",
    { headers: { cookie: cookies.admin! } },
  );
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(d.detail.plays > 0);
  assert.ok(d.daily.length);
  assert.equal(
    (
      await fetch(origin + "/api/admin/usage-statistics/champions/no-such", {
        headers: { cookie: cookies.admin! },
      })
    ).status,
    404,
  );
});
test("durable AI completion replay is captured once; reward/quest receipt is not trusted as a winner counter", async () => {
  let state = initial("ai-00000000-0000-4000-8000-000000000001");
  const identity = {
    userId: "user-a",
    deckId: "local-deck",
    aiDeckId: "local-ai",
    matchId: state.gameId,
  };
  await saveAIQuestStart(identity, state, "NORMAL", deck);
  assert.equal(
    await processStoredAIQuestMatch(
      { ...identity, actions: [{ type: "SURRENDER" }] },
      replayAIMatch,
    ),
    true,
  );
  assert.equal(
    await processStoredAIQuestMatch(
      { ...identity, actions: [{ type: "SURRENDER" }] },
      replayAIMatch,
    ),
    true,
  );
  await collectUsageBatch();
  const [row] = await queryRows(
    database,
    sql`SELECT outcome FROM usage_participations WHERE source_key=${"ai:" + identity.matchId}`,
  );
  assert.equal(row!.outcome, "LOSS");
  assert.equal(await collectUsageBatch(), 0);
});
test("tower pending outbox survives next-battle overwrite and reprocessing", async () => {
  const summary = {
    ...sample.summary,
    matchId: "local-tower-battle",
    startedAt: new Date(Date.now() - 1000).toISOString(),
    endedAt: new Date().toISOString(),
  };
  await database
    .insert(schema.towerSeasonsTable)
    .values({ id: "local-season", name: "Isolated usage QA", data: {} });
  await database.insert(schema.towerRunsTable).values({
    id: "local-tower-run",
    userId: "user-a",
    seasonId: "local-season",
    state: {},
    snapshot: {},
    usagePending: [summary as unknown as Record<string, unknown>],
    currentBattle: null,
  });
  await collectUsageBatch();
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT * FROM usage_participations WHERE source_key='tower:local-tower-battle'`,
      )
    ).length,
    1,
  );
  assert.deepEqual(
    (
      await database
        .select()
        .from(schema.towerRunsTable)
        .where(eq(schema.towerRunsTable.id, "local-tower-run"))
    )[0]!.usagePending,
    [],
  );
  await database
    .update(schema.towerRunsTable)
    .set({ usagePending: [summary as unknown as Record<string, unknown>] })
    .where(eq(schema.towerRunsTable.id, "local-tower-run"));
  await collectUsageBatch();
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT * FROM usage_participations WHERE source_key='tower:local-tower-battle'`,
      )
    ).length,
    1,
  );
});
test("actual server replay PLAY → token → ability → quest → cancel → finish → collect → admin API", async () => {
  const state = initial("ai-00000000-0000-4000-8000-000000000002");
  const identity = {
    userId: "user-a",
    deckId: "local-deck",
    aiDeckId: "local-ai",
    matchId: state.gameId,
  };
  await saveAIQuestStart(identity, state, "NORMAL", deck);
  const unitCard = state.players[0]!.hand.find(
    (c) => c.definitionId === unit.id,
  )!;
  const spawn = state.players[0]!.hand.find(
    (c) => c.definitionId === spawner.id,
  )!;
  const technique = state.players[0]!.hand.find(
    (c) => c.definitionId === spell.id,
  )!;
  const actions = [
    {
      type: "PLAY_WRESTLER",
      cardInstanceId: unitCard.instanceId,
      boardSlot: 0,
    },
    { type: "PLAY_WRESTLER", cardInstanceId: spawn.instanceId, boardSlot: 1 },
    { type: "USE_CHAMPION_ABILITY" },
    { type: "END_TURN" },
    { actor: "AI", type: "END_TURN" },
    {
      type: "BEGIN_TARGETED_ACTION",
      action: { type: "PLAY_TECHNIQUE", cardInstanceId: technique.instanceId },
    },
    { type: "CANCEL_EFFECT_TARGET" },
    { type: "SURRENDER" },
  ];
  assert.equal(
    await processStoredAIQuestMatch({ ...identity, actions }, replayAIMatch),
    true,
  );
  await collectUsageBatch();
  const [p] = await queryRows(
    database,
    sql`SELECT * FROM usage_participations WHERE source_key=${"ai:" + identity.matchId}`,
  );
  assert.equal(p!.ability_uses, 1);
  assert.equal(p!.quest_completed, true);
  assert.equal(p!.quest_turn, 1);
  assert.equal(p!.outcome, "LOSS");
  const cards = await queryRows(
    database,
    sql`SELECT * FROM usage_card_matches WHERE participation_id=${p!.id}`,
  );
  assert.equal(cards.find((c) => c.card_id === unit.id)!.plays, 1);
  assert.equal(cards.find((c) => c.card_id === spell.id)!.plays, 0);
  assert.equal(cards.find((c) => c.card_id === token.id)!.plays, 0);
  assert.equal(cards.find((c) => c.card_id === token.id)!.generated, 1);
  const before = (
    await queryRows(
      database,
      sql`SELECT SUM(plays)::int AS n FROM usage_card_daily`,
    )
  )[0]!.n;
  await processStoredAIQuestMatch({ ...identity, actions }, replayAIMatch);
  await collectUsageBatch();
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT SUM(plays)::int AS n FROM usage_card_daily`,
      )
    )[0]!.n,
    before,
  );
  const response = await fetch(
    origin + "/api/admin/usage-statistics/champions/" + hero.id,
    { headers: { cookie: cookies.admin! } },
  );
  assert.equal(response.status, 200);
  assert.ok((await response.json()).detail.ability_uses >= 1);
});
test("failed ability and cancelled post-commit ability are excluded without changing combat costs or events", () => {
  let state = initial("cancelled-ability");
  state.players[0]!.champion!.ability = {
    ...hero.ability,
    effects: [
      {
        type: "STRUCTURED",
        action: "BUFF",
        target: {
          zone: "BOARD",
          owner: "SELF",
          selection: "PLAYER_CHOICE",
          count: 1,
        },
        values: { attack: 1, health: 0 },
      },
    ],
  };
  const missing = executeAction(state, {
    type: "USE_CHAMPION_ABILITY",
    playerId: "player-1",
  });
  assert.equal(missing.success, false);
  const c = state.players[0]!.hand.find((c) => c.definitionId === unit.id)!;
  state = action(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: c.instanceId,
    boardSlot: 0,
  });
  state = action(state, { type: "END_TURN", playerId: "player-1" });
  state = action(state, { type: "END_TURN", playerId: "player-2" });
  state = action(state, { type: "USE_CHAMPION_ABILITY", playerId: "player-1" });
  assert.ok(state.targetingState?.active);
  state = action(state, { type: "CANCEL_EFFECT_TARGET", playerId: "player-1" });
  assert.equal(state.players[0]!.championAbilityUsedThisTurn, true);
  state = action(state, { type: "SURRENDER", playerId: "player-1" });
  const summary = summarizeUsage(
    state,
    { version: 1, startedAt: now.toISOString(), decks: { "player-1": deck } },
    now,
  )!;
  assert.equal(summary.participants[0]!.abilityUses, 0);
  assert.equal(
    state.events.filter((e) => e.type === "CHAMPION_ABILITY_USED").length,
    1,
  );
});
test("unknown deck denominator, no quest and empty date range do not invent rates", async () => {
  const s = structuredClone(sample.summary);
  s.startedAt = "2026-08-01T00:00:00Z";
  s.endedAt = "2026-08-02T00:00:00Z";
  s.participants = s.participants.slice(1);
  s.participants[0]!.deckKnown = false;
  s.participants[0]!.cards = [];
  await ingestUsage("unknown-deck-only", s, { "player-2": "user-b" });
  const data = await readUsageStatistics(
    "cards",
    statisticsQuery({ period: "7" }),
    unit.id,
    database,
    new Date("2026-08-02T12:00:00Z"),
  );
  assert.equal(data.totals.knownDecks, 0);
  assert.equal(data.detail!.adoptionRate, null);
  assert.equal(data.detail!.winRate, null);
  assert.equal(data.detail!.plays, 0);
  assert.equal(data.comparison!.changePercent, null);
  const empty = await readUsageStatistics(
    "champions",
    statisticsQuery({ period: "7" }),
    hero.id,
    database,
    new Date("2026-07-01T00:00:00Z"),
  );
  assert.equal(empty.detail!.selectionRate, null);
  assert.equal(empty.detail!.questRate, null);
  assert.deepEqual(empty.daily, []);
});
test("transaction failure rolls back all rollups and a later retry is counted exactly once", async () => {
  const broken = {
    ...sample.summary,
    participants: [
      {
        ...sample.summary.participants[0]!,
        cards: [
          { id: unit.id, deckCopies: 1, plays: -1, generated: 0, summons: 0 },
        ],
      },
    ],
  };
  const before = (
    await queryRows(
      database,
      sql`SELECT COUNT(*)::int AS n FROM usage_participations`,
    )
  )[0]!.n;
  await assert.rejects(
    ingestUsage("retry-after-sql-failure", broken, { "player-1": "user-a" }),
  );
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT COUNT(*)::int AS n FROM usage_participations`,
      )
    )[0]!.n,
    before,
  );
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT * FROM usage_processed_sources WHERE source_key='retry-after-sql-failure'`,
      )
    ).length,
    0,
  );
  await ingestUsage("retry-after-sql-failure", sample.summary, {
    "player-1": "user-a",
  });
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT COUNT(*)::int AS n FROM usage_participations`,
      )
    )[0]!.n,
    Number(before) + 1,
  );
});
test("a failed source remains durable with backoff while other matches continue", async () => {
  const summary = {
    ...sample.summary,
    matchId: "failing-tower-summary",
    unresolvedEvents: 1,
    startedAt: new Date(Date.now() - 1000).toISOString(),
    endedAt: new Date().toISOString(),
  };
  const good = {
    ...summary,
    matchId: "healthy-tower-summary",
    unresolvedEvents: 0,
  };
  await database
    .update(schema.towerRunsTable)
    .set({
      usagePending: [summary, good] as unknown as Record<string, unknown>[],
    })
    .where(eq(schema.towerRunsTable.id, "local-tower-run"));
  await collectUsageBatch();
  const [row] = await database
    .select()
    .from(schema.towerRunsTable)
    .where(eq(schema.towerRunsTable.id, "local-tower-run"));
  assert.equal(row!.usagePending.length, 1);
  assert.equal((row!.usagePending[0] as any).matchId, summary.matchId);
  const [failure] = await queryRows(
    database,
    sql`SELECT * FROM usage_collection_failures WHERE source_key='tower:failing-tower-summary'`,
  );
  assert.equal(failure!.attempts, 1);
  await collectUsageBatch();
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT attempts FROM usage_collection_failures WHERE source_key='tower:failing-tower-summary'`,
      )
    )[0]!.attempts,
    1,
  );
  await database
    .update(schema.towerRunsTable)
    .set({
      usagePending: [{ ...summary, unresolvedEvents: 0 }] as unknown as Record<
        string,
        unknown
      >[],
    })
    .where(eq(schema.towerRunsTable.id, "local-tower-run"));
  await database.execute(
    sql`UPDATE usage_collection_failures SET next_retry_at=now()-interval '1 second' WHERE source_key='tower:failing-tower-summary'`,
  );
  await collectUsageBatch();
  assert.equal(
    (await queryRows(database, sql`SELECT * FROM usage_collection_failures`))
      .length,
    0,
  );
});
test("durable PvP collector includes both humans, excludes active/cancelled records and recovers receipt-before-checkpoint crashes", async () => {
  await database.insert(schema.decksTable).values(
    ["user-a", "user-b"].map((id) => ({
      id: "statistics-deck-" + id,
      userId: id,
      name: "Statistics QA",
      cardDefinitionIds: deck,
    })),
  );
  const state = JSON.parse(
    JSON.stringify(sample.state)
      .replaceAll("player-1", "PLAYER_ONE")
      .replaceAll("player-2", "PLAYER_TWO"),
  ) as GameState;
  const start = {
    ...sample.start,
    decks: { PLAYER_ONE: deck, PLAYER_TWO: deck },
  };
  for (const status of ["ENDED", "ACTIVE", "CANCELLED"] as const)
    await database.insert(schema.onlineMatchesTable).values({
      id: "statistics-online-" + status,
      status,
      player1UserId: "user-a",
      player2UserId: "user-b",
      player1DeckId: "statistics-deck-user-a",
      player2DeckId: "statistics-deck-user-b",
      serializedSnapshot: {
        player1UserId: "user-a",
        player2UserId: "user-b",
        usageStart: start,
      },
      serializedGameState: state,
      endedAt: now,
    });
  await collectUsageBatch();
  const p = await queryRows(
    database,
    sql`SELECT outcome FROM usage_participations WHERE source_key='pvp:statistics-online-ENDED'`,
  );
  assert.equal(p.length, 2);
  assert.deepEqual(p.map((p) => p.outcome).sort(), ["LOSS", "WIN"]);
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT * FROM usage_processed_sources WHERE source_key IN ('pvp:statistics-online-ACTIVE','pvp:statistics-online-CANCELLED')`,
      )
    ).length,
    0,
  );
  await database.execute(
    sql`UPDATE online_matches SET usage_recorded_at=NULL WHERE id='statistics-online-ENDED'`,
  );
  await collectUsageBatch();
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT * FROM usage_participations WHERE source_key='pvp:statistics-online-ENDED'`,
      )
    ).length,
    2,
  );
  assert.ok(
    (
      await queryRows(
        database,
        sql`SELECT usage_recorded_at FROM online_matches WHERE id='statistics-online-ENDED'`,
      )
    )[0]!.usage_recorded_at,
  );
});
test("draft real players join the common totals while administrator diagnostics and NPC seats do not", async () => {
  const state = JSON.parse(
    JSON.stringify(sample.state)
      .replaceAll("player-1", "PLAYER_ONE")
      .replaceAll("player-2", "PLAYER_TWO"),
  ) as GameState;
  for (const diagnostic of [true, false])
    await database.insert(schema.draftSessionsTable).values({
      id: "statistics-draft-" + diagnostic,
      state: {
        battle: state,
        seats: [{ userId: "user-a" }, { userId: null }],
      },
      snapshot: {},
      usageDiagnostic: diagnostic,
      usageStart: {
        version: 1,
        startedAt: new Date(Date.now() - 1000).toISOString(),
        diagnostic,
        decks: { PLAYER_ONE: deck, PLAYER_TWO: deck },
      },
    });
  await collectUsageBatch();
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT * FROM usage_participations WHERE source_key='draft:statistics-draft-true'`,
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT * FROM usage_participations WHERE source_key='draft:statistics-draft-false'`,
      )
    ).length,
    1,
  );
});
test("return and transform retain earlier card IDs and count a later successful hand play separately", async () => {
  const { applyEffect } =
    await import("../../../artifacts/ko-game/src/game/effects/effect-engine");
  let state = initial("transform-and-replay");
  const c = state.players[0]!.hand.find((c) => c.definitionId === unit.id)!;
  state = action(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: c.instanceId,
    boardSlot: 0,
  });
  state = action(state, { type: "END_TURN", playerId: "player-1" });
  state = action(state, { type: "END_TURN", playerId: "player-2" });
  let returnedSource = state.players[0]!.board[0]!;
  state = applyEffect(state, "player-1", returnedSource, {
    type: "STRUCTURED",
    action: "MOVE_TO_HAND",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
  state = action(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: c.instanceId,
    boardSlot: 0,
  });
  let source = state.players[0]!.board[0]!;
  state = applyEffect(state, "player-1", source, {
    type: "STRUCTURED",
    action: "TRANSFORM_TARGET",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
    values: { definition: token },
  });
  source = state.players[0]!.board[0]!;
  assert.equal(source.definitionId, token.id);
  state = applyEffect(state, "player-1", source, {
    type: "STRUCTURED",
    action: "MOVE_TO_HAND",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
  state = action(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: c.instanceId,
    boardSlot: 0,
  });
  state = action(state, { type: "SURRENDER", playerId: "player-1" });
  const summary = summarizeUsage(state, sample.start, now)!;
  assert.equal(
    summary.participants[0]!.cards.find((c) => c.id === unit.id)!.plays,
    2,
  );
  assert.equal(
    summary.participants[0]!.cards.find((c) => c.id === token.id)!.plays,
    1,
  );
  assert.equal(
    summary.participants[0]!.cards.find((c) => c.id === token.id)!.deckCopies,
    0,
  );
});
test("retiring 30-day raw summaries preserves exact 90-day and all-time distinct users and aggregates", async () => {
  const before = await readUsageStatistics(
    "cards",
    statisticsQuery({ period: "all" }),
    unit.id,
    database,
    now,
  );
  await database.execute(sql`UPDATE usage_collection SET last_pruned_at=NULL`);
  await collectUsageBatch();
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT id FROM usage_participations WHERE day<'2026-09-16'`,
      )
    ).length,
    0,
  );
  const after = await readUsageStatistics(
    "cards",
    statisticsQuery({ period: "all" }),
    unit.id,
    database,
    now,
  );
  assert.equal(after.detail!.users, before.detail!.users);
  assert.equal(after.detail!.plays, before.detail!.plays);
  assert.equal(after.detail!.adoptions, before.detail!.adoptions);
});
test("duplicate quest-completion events count one completed match and the first actual completion turn", () => {
  const state = structuredClone(sample.state),
    completion = state.events.find(
      (e) => e.type === "CHAMPION_QUEST_COMPLETED",
    )!;
  state.events.push({ ...completion, turn: 999 });
  const summary = summarizeUsage(state, sample.start, now)!;
  assert.equal(summary.participants[0]!.questCompleted, true);
  assert.equal(summary.participants[0]!.questTurn, completion.turn);
});
test("quest averages use the same paired-turn number as the actual battle HUD", async () => {
  let state = initial("late-quest");
  for (let i = 0; i < 4; i++)
    state = action(state, { type: "END_TURN", playerId: state.activePlayerId });
  const card = state.players[0]!.hand.find((c) => c.definitionId === unit.id)!;
  state = action(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: card.instanceId,
    boardSlot: 0,
  });
  state = action(state, { type: "SURRENDER", playerId: "player-1" });
  const summary = summarizeUsage(state, sample.start, now)!;
  assert.equal(summary.participants[0]!.questTurn, 5);
  const before = Number(
    (
      await queryRows(
        database,
        sql`SELECT SUM(quest_turn_sum) AS n FROM usage_champion_daily`,
      )
    )[0]!.n,
  );
  await ingestUsage("late-quest", summary, { "player-1": "user-a" });
  assert.equal(
    Number(
      (
        await queryRows(
          database,
          sql`SELECT SUM(quest_turn_sum) AS n FROM usage_champion_daily`,
        )
      )[0]!.n,
    ) - before,
    3,
  );
});
test("concurrent duplicate submissions produce one claim and original champion selection remains stable", async () => {
  const summary = summarizeUsage(
    sample.state,
    {
      ...sample.start,
      champions: { "player-1": "selected-original-champion" },
    },
    now,
  )!;
  assert.equal(
    summary.participants[0]!.championId,
    "selected-original-champion",
  );
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      ingestUsage("concurrent-finish", summary, { "player-1": "user-a" }),
    ),
  );
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT * FROM usage_participations WHERE source_key='concurrent-finish'`,
      )
    ).length,
    1,
  );
});
test("database RLS hides raw analytics from an unprivileged direct SQL role", async () => {
  await pg.exec(
    "CREATE ROLE statistics_anon; GRANT USAGE ON SCHEMA public TO statistics_anon; GRANT SELECT ON usage_participations,usage_card_daily,ai_quest_matches,tower_runs,online_matches,draft_sessions TO statistics_anon; SET ROLE statistics_anon;",
  );
  try {
    assert.equal(
      (
        await pg.query<{ n: number }>(
          "SELECT COUNT(*)::int AS n FROM usage_participations",
        )
      ).rows[0]!.n,
      0,
    );
    assert.equal(
      (
        await pg.query<{ n: number }>(
          "SELECT COUNT(*)::int AS n FROM usage_card_daily",
        )
      ).rows[0]!.n,
      0,
    );
    for (const table of [
      "ai_quest_matches",
      "tower_runs",
      "online_matches",
      "draft_sessions",
    ])
      assert.equal(
        (
          await pg.query<{ n: number }>(
            "SELECT COUNT(*)::int AS n FROM " + table,
          )
        ).rows[0]!.n,
        0,
      );
  } finally {
    await pg.exec("RESET ROLE");
  }
});
test("verified AI receipt survives unrelated quest transaction failure and restart before settlement", async () => {
  const state = initial("ai-00000000-0000-4000-8000-000000000003"),
    identity = {
      userId: "user-a",
      deckId: "local-deck",
      aiDeckId: "local-ai",
      matchId: state.gameId,
    };
  await saveAIQuestStart(identity, state, "NORMAL", deck);
  const transaction = db.transaction;
  Object.assign(db, {
    transaction: async () => {
      throw new Error("INJECTED_QUEST_TRANSACTION_FAILURE");
    },
  });
  try {
    await assert.rejects(
      processStoredAIQuestMatch(
        { ...identity, actions: [{ type: "SURRENDER" }] },
        replayAIMatch,
      ),
      /INJECTED_QUEST/,
    );
  } finally {
    Object.assign(db, { transaction });
  }
  const [saved] = await database
    .select()
    .from(schema.aiQuestMatchesTable)
    .where(eq(schema.aiQuestMatchesTable.id, identity.matchId));
  assert.equal(saved!.processedAt, null);
  assert.ok(saved!.usageSummary);
  await collectUsageBatch();
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT * FROM usage_participations WHERE source_key=${"ai:" + identity.matchId}`,
      )
    ).length,
    1,
  );
  await processStoredAIQuestMatch(
    { ...identity, actions: [{ type: "SURRENDER" }] },
    replayAIMatch,
  );
  await collectUsageBatch();
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT * FROM usage_participations WHERE source_key=${"ai:" + identity.matchId}`,
      )
    ).length,
    1,
  );
});
test("a statistics checkpoint error does not fail existing AI quest/result processing", async () => {
  const state = initial("ai-00000000-0000-4000-8000-000000000004"),
    identity = {
      userId: "user-a",
      deckId: "local-deck",
      aiDeckId: "local-ai",
      matchId: state.gameId,
    };
  await saveAIQuestStart(identity, state, "NORMAL", deck);
  const update = db.update;
  Object.assign(db, {
    update: () => {
      throw new Error("INJECTED_STATISTICS_CHECKPOINT_FAILURE");
    },
  });
  try {
    assert.equal(
      await processStoredAIQuestMatch(
        { ...identity, actions: [{ type: "SURRENDER" }] },
        replayAIMatch,
      ),
      true,
    );
  } finally {
    Object.assign(db, { update });
  }
  await collectUsageBatch();
  assert.equal(
    (
      await queryRows(
        database,
        sql`SELECT * FROM usage_participations WHERE source_key=${"ai:" + identity.matchId}`,
      )
    ).length,
    1,
  );
});
test("successful targeted spell is counted only after real precommit confirmation", () => {
  let state = initial("successful-spell");
  const c = state.players[0]!.hand.find((c) => c.definitionId === unit.id)!,
    s = state.players[0]!.hand.find((c) => c.definitionId === spell.id)!;
  state = action(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: c.instanceId,
    boardSlot: 0,
  });
  state = action(state, { type: "END_TURN", playerId: "player-1" });
  state = action(state, { type: "END_TURN", playerId: "player-2" });
  state = action(state, {
    type: "BEGIN_TARGETED_ACTION",
    playerId: "player-1",
    action: { type: "PLAY_TECHNIQUE", cardInstanceId: s.instanceId },
  });
  state = action(state, {
    type: "CONFIRM_PRECOMMIT_TARGET",
    playerId: "player-1",
    targetId: c.instanceId,
  });
  assert.equal(state.players[0]!.board[0]!.currentAttack, 2);
  state = action(state, { type: "SURRENDER", playerId: "player-1" });
  assert.equal(
    summarizeUsage(state, sample.start, now)!.participants[0]!.cards.find(
      (c) => c.id === spell.id,
    )!.plays,
    1,
  );
});
test("generated-only hand cards and automatically summoned champion tokens remain distinct from hand plays", async () => {
  const { applyEffect } =
    await import("../../../artifacts/ko-game/src/game/effects/effect-engine");
  let state = initial("generated-zones");
  const c = state.players[0]!.hand.find((c) => c.definitionId === unit.id)!;
  state = action(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: c.instanceId,
    boardSlot: 0,
  });
  const source = state.players[0]!.board[0]!;
  const championToken = {
    ...token,
    id: "stats-champion-token",
    isChampionToken: true,
  };
  state = applyEffect(state, "player-1", source, {
    type: "STRUCTURED",
    action: "SUMMON",
    values: { definition: championToken, count: 1 },
  });
  state = applyEffect(state, "player-1", source, {
    type: "STRUCTURED",
    action: "GENERATE",
    values: { definition: token, count: 1, destination: "HAND" },
  });
  state = action(state, { type: "SURRENDER", playerId: "player-1" });
  const p = summarizeUsage(state, sample.start, now)!.participants[0]!;
  const champion = p.cards.find((c) => c.id === championToken.id)!;
  assert.equal(champion.summons, 1);
  assert.equal(champion.plays, 0);
  assert.equal(champion.deckCopies, 0);
  const hand = p.cards.find((c) => c.id === token.id)!;
  assert.equal(hand.generated, 1);
  assert.equal(hand.summons, 0);
  assert.equal(hand.plays, 0);
  assert.equal(hand.deckCopies, 0);
});
test("server pagination and numeric column sorting keep stable distinct content IDs", async () => {
  const before = await readUsageStatistics(
    "cards",
    statisticsQuery({ period: "all" }),
    undefined,
    database,
    now,
  );
  const extras = Array.from({ length: 60 }, (_, i) => ({
    id: "stats-pagination-" + i,
    name: "페이지 검증 " + i,
    cardType: "WRESTLER" as const,
    rarity: "NORMAL",
    cost: i % 6,
    attack: 1,
    health: 1,
    text: "",
    status: "PUBLISHED" as const,
  }));
  await database.insert(schema.cardsTable).values(extras);
  try {
    const first = await readUsageStatistics(
      "cards",
      statisticsQuery({ period: "all", sort: "cost", direction: "asc" }),
      undefined,
      database,
      now,
    );
    const second = await readUsageStatistics(
      "cards",
      statisticsQuery({
        period: "all",
        sort: "cost",
        direction: "asc",
        page: 2,
      }),
      undefined,
      database,
      now,
    );
    assert.equal(first.items.length, 50);
    assert.equal(first.total, before.total + 60);
    assert.equal(
      new Set([...first.items, ...second.items].map((c) => c.id)).size,
      first.total,
    );
    const costs = first.items.map((c) => c.cost).filter((c) => c != null);
    assert.deepEqual(
      costs,
      [...costs].sort((a, b) => a - b),
    );
  } finally {
    await database.execute(
      sql`DELETE FROM cards WHERE id LIKE 'stats-pagination-%'`,
    );
  }
});
if (process.env.KO_STATS_PERF === "1")
  test("isolated 1000-participation performance and query-count benchmark", async () => {
    let statements = 0;
    const instrument = (executor: any) => ({
      execute: (...args: any[]) => {
        statements++;
        return executor.execute(...args);
      },
    });
    const monitored = {
      ...instrument(database),
      transaction: (work: any, config: any) =>
        database.transaction((tx) => work(instrument(tx)), config),
    } as any;
    let startTime = performance.now();
    for (let i = 0; i < 1000; i++)
      await ingestUsage(
        "benchmark:" + i,
        sample.summary,
        { "player-1": "user-a" },
        monitored,
      );
    const ingestMs = performance.now() - startTime,
      ingestStatements = statements;
    statements = 0;
    startTime = performance.now();
    await readUsageStatistics(
      "cards",
      statisticsQuery({ period: "all" }),
      undefined,
      monitored,
      now,
    );
    const listMs = performance.now() - startTime,
      listStatements = statements;
    statements = 0;
    startTime = performance.now();
    await readUsageStatistics(
      "cards",
      statisticsQuery({ period: "all" }),
      unit.id,
      monitored,
      now,
    );
    const detailMs = performance.now() - startTime,
      detailStatements = statements;
    assert.equal(ingestStatements, 9000);
    assert.equal(listStatements, 4);
    assert.equal(detailStatements, 6);
    const sizes = await queryRows(
      database,
      sql`SELECT relname,pg_total_relation_size(oid)::float8 AS bytes FROM pg_class WHERE relkind='r' AND relname LIKE 'usage_%' ORDER BY relname`,
    );
    const plan = await queryRows(
      database,
      sql`EXPLAIN (ANALYZE,FORMAT JSON) SELECT card_id,SUM(plays) FROM usage_card_daily WHERE day BETWEEN '2026-10-01' AND '2026-10-31' GROUP BY card_id`,
    );
    await mkdir("qa-results/usage-statistics", { recursive: true });
    await writeFile(
      "qa-results/usage-statistics/performance.json",
      JSON.stringify(
        {
          environment: "isolated PGlite, not production load test",
          participations: 1000,
          cardsPerParticipant: sample.summary.participants[0]!.cards.length,
          ingestMs,
          ingestStatements,
          listMs,
          listStatements,
          detailMs,
          detailStatements,
          sizes,
          plan,
        },
        null,
        2,
      ),
    );
  });
after(async () => {
  if (process.env.KO_STATS_BROWSER_MODE === "1") {
    await database
      .update(schema.cardsTable)
      .set({ imageUrl: "/api/qa-stat-assets/card.webp" })
      .where(eq(schema.cardsTable.id, unit.id));
    await database
      .update(schema.championsTable)
      .set({ imageUrl: "/api/qa-stat-assets/champion.webp" })
      .where(eq(schema.championsTable.id, hero.id));
    await mkdir("qa-results/usage-statistics", { recursive: true });
    await writeFile(
      "qa-results/usage-statistics/fixture.json",
      JSON.stringify({ origin, cookie: cookies.admin }),
    );
    console.log("USAGE_BROWSER_READY " + origin);
    await new Promise(() => {});
  }
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
  await pg.close();
});
