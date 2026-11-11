/** Isolated actual PvP persistence. SQL delay is a controlled benchmark, not production latency. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { registerHooks } from "node:module";
import { createServer } from "node:http";
import ts from "typescript";

if (process.env.KO_LATENCY_BASELINE === "1") {
  // Execute the pre-change modules without mutating the working tree.
  const paths = [
    "artifacts/api-server/src/lib/daily-quest-service.ts",
    "artifacts/api-server/src/online/service.ts",
  ];
  const originals = new Map(
    paths.map((path) => [
      new URL("../../" + path, import.meta.url).href,
      execFileSync("git", ["show", "74f30a4:" + path], { encoding: "utf8" }),
    ]),
  );
  registerHooks({
    load(url, context, next) {
      return originals.has(url)
        ? {
            format: "module",
            shortCircuit: true,
            source: ts.transpileModule(originals.get(url), {
              compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
              },
            }).outputText,
          }
        : next(url, context);
    },
  });
}
const { startTutorialFixture } = await import("./tutorial-rewards-fixture.mjs");
const { createInitialGameState } =
  await import("../../artifacts/ko-game/src/game/engine/create-initial-game-state.ts");
const { generateCardInstance } =
  await import("../../artifacts/ko-game/src/game/cards/generation.ts");
const { cardRecordToDefinition } =
  await import("../../artifacts/ko-game/src/game/cards/published-cards.ts");
const { eq } = await import("../../lib/db/node_modules/drizzle-orm/index.js");

test("PvP SQL cost, atomic persistence, replay, reconnect and batched quest credit", async () => {
  const f = await startTutorialFixture();
  const service =
    await import("../../artifacts/api-server/src/online/service.ts");
  const quests =
    await import("../../artifacts/api-server/src/lib/daily-quest-service.ts");
  const ids = [];
  let queryCount = 0,
    collecting = false;
  const delay = Number(process.env.KO_LATENCY_SQL_DELAY_MS ?? 0);
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
  f.db._.session.logger.logQuery = () => {
    if (collecting) {
      queryCount++;
      if (delay) Atomics.wait(waitBuffer, 0, 0, delay);
    }
  };
  f.db._.session.options.logger = f.db._.session.logger;
  const metrics = {
    baseline: process.env.KO_LATENCY_BASELINE === "1",
    sqlDelayMs: delay,
    actions: [],
  };
  try {
    await f.db
      .insert(f.schema.usersTable)
      .values({
        id: "latency-opponent",
        email: "latency@example.invalid",
        nickname: "상대",
        passwordHash: "unusable",
      });
    await f.db.insert(f.schema.decksTable).values([
      { id: "latency-one", userId: "tutorial-user", name: "격리" },
      { id: "latency-two", userId: "latency-opponent", name: "격리" },
    ]);
    await f.db
      .insert(f.schema.questSeasonsTable)
      .values({
        id: "latency-season",
        name: "격리 시즌",
        startsAt: new Date("2020-01-01"),
        endsAt: new Date("2099-01-01"),
      });
    await f.db
      .insert(f.schema.dailyQuestDefinitionsTable)
      .values([
        {
          id: "disabled-quest",
          title: "비활성",
          description: "선택 금지",
          objectiveType: "CARD_PLAYED",
          targetValue: 100,
          enabled: false,
        },
        ...["CARD_PLAYED", "DAMAGE_DEALT", "ATTACK_DECLARED"].map(
          (objectiveType, i) => ({
            id: "latency-daily-" + i,
            title: "격리 일일",
            description: "격리",
            objectiveType,
            targetValue: 1000,
          }),
        ),
        {
          id: "latency-season-quest",
          title: "격리 시즌",
          description: "격리",
          objectiveType: "CARD_PLAYED",
          targetValue: 1000,
          platform: { questType: "SEASON", seasonId: "latency-season" },
        },
      ]);
    const unit = {
      id: "latency-unit",
      name: "격리 선수",
      cardType: "WRESTLER",
      rarity: "NORMAL",
      cost: 1,
      attack: 2,
      health: 3,
      keywords: [],
      rulesText: "",
      abilities: [],
    };
    async function fixture() {
      const id = "latency-" + ids.length;
      ids.push(id);
      const s = createInitialGameState();
      Object.assign(s, {
        gameId: id,
        status: "IN_PROGRESS",
        turn: 3,
        activePlayerId: "PLAYER_ONE",
        openingMulligan: undefined,
        events: [],
      });
      s.cardPool = [
        ...JSON.parse(
          readFileSync("docs/qa/snapshots/20261111-admin/cards.json"),
        ).map(cardRecordToDefinition),
        unit,
      ];
      s.players = s.players.map((p, i) => ({
        ...p,
        id: i ? "PLAYER_TWO" : "PLAYER_ONE",
        currentGold: 6,
        deck: Array.from({ length: 20 }, (_, j) =>
          generateCardInstance(unit, { instanceId: "deck-" + i + "-" + j }),
        ),
        hand: [generateCardInstance(unit, { instanceId: "hand-" + i })],
        board: [null, null, null, null],
        champion: {
          ...p.champion,
          quest: null,
          questCompleted: false,
          questProgress: 0,
        },
      }));
      await f.db.insert(f.schema.onlineMatchesTable).values({
        id,
        status: "ACTIVE",
        player1UserId: "tutorial-user",
        player2UserId: "latency-opponent",
        player1DeckId: "latency-one",
        player2DeckId: "latency-two",
        serializedGameState: s,
        serializedSnapshot: {
          player1UserId: "tutorial-user",
          player2UserId: "latency-opponent",
          player1DeckId: "latency-one",
          player2DeckId: "latency-two",
          cardDefinitions: s.cardPool,
          championDefinitions: [],
          publicPlayers: [
            { userId: "tutorial-user", nickname: "검증" },
            { userId: "latency-opponent", nickname: "상대" },
          ],
          introFirstSpeaker: null,
        },
      });
      return service.getRuntime(id);
    }
    let r = await fixture();
    if (process.env.KO_LATENCY_BASELINE !== "1")
      await f.db.transaction(async (tx) => {
        const context = await quests.loadQuestProcessingContext(tx);
        const assigned = await quests.ensureDailyQuestAssignments(
          "tutorial-user",
          undefined,
          tx,
          context,
        );
        assert.ok(assigned.every((a) => a.definitionId !== "disabled-quest"));
      });
    // Warm assignments outside timed steady-state actions.
    await f.db.transaction(async (tx) => {
      for (const [user, seat] of [
        ["tutorial-user", "PLAYER_ONE"],
        ["latency-opponent", "PLAYER_TWO"],
      ])
        await quests.processMatchEventsForDailyQuests(
          user,
          seat,
          r.matchId,
          r.state,
          0,
          tx,
          undefined,
          "PVP",
        );
    });
    for (let i = 0; i < 6; i++) {
      const user = i % 2 ? "latency-opponent" : "tutorial-user";
      const before = r.version,
        request = "turn-" + i;
      queryCount = 0;
      collecting = true;
      const started = performance.now();
      const result = await service.applyMatchAction(
        r.matchId,
        user,
        request,
        before,
        { type: "END_TURN" },
      );
      const elapsedMs = performance.now() - started;
      collecting = false;
      assert.ok(result.ok, result.message);
      const views = ["tutorial-user", "latency-opponent"].map((user) =>
        service.messageForViewer(result, user),
      );
      metrics.actions.push({
        sqlQueries: queryCount,
        elapsedMs: Math.round(elapsedMs * 10) / 10,
        bytes: Buffer.byteLength(JSON.stringify(views[0])),
      });
      assert.equal(views[0].version, views[1].version);
      const replay = await service.applyMatchAction(
        r.matchId,
        user,
        request,
        before,
        { type: "END_TURN" },
      );
      assert.ok(replay.ok && replay.duplicate);
      assert.equal(r.version, before + 1);
    }
    const version = r.version,
      turn = r.state.turn;
    service.cleanupMatchRuntime(r.matchId);
    r = await service.getRuntime(r.matchId);
    assert.equal(r.version, version);
    assert.equal(r.state.turn, turn);
    // A real SQL failure must roll back both state and reward progress.
    const originalTransaction = f.db.transaction;
    const { db } = await import("../../lib/db/src/index.ts");
    const transaction = db.transaction;
    db.transaction = async () => {
      throw Error("isolated injected storage failure");
    };
    await assert.rejects(
      () =>
        service.applyMatchAction(r.matchId, "tutorial-user", "fail", version, {
          type: "END_TURN",
        }),
      /injected storage failure/,
    );
    db.transaction = transaction;
    assert.equal(r.version, version);
    assert.equal(r.state.turn, turn);
    assert.equal(f.db.transaction, originalTransaction);
    // Large single-action event batches, duplicates and partial replay.
    const state = structuredClone(r.state);
    state.events = Array.from({ length: 40 }, () => ({
      type: "CARD_PLAYED",
      playerId: "PLAYER_ONE",
      cardType: "WRESTLER",
    }));
    const processBatch = () =>
      f.db.transaction(async (tx) =>
        quests.processMatchEventsForDailyQuests(
          "tutorial-user",
          "PLAYER_ONE",
          "latency-batch",
          state,
          0,
          tx,
          undefined,
          "PVP",
        ),
      );
    collecting = true;
    queryCount = 0;
    await processBatch();
    collecting = false;
    metrics.batchQueries = queryCount;
    if (process.env.KO_LATENCY_BASELINE !== "1") {
      assert.ok(metrics.actions.every((a) => a.sqlQueries <= 10));
      assert.ok(metrics.batchQueries <= 12);
    }
    const assignment = () =>
      f.db
        .select()
        .from(f.schema.dailyQuestAssignmentsTable)
        .where(
          eq(
            f.schema.dailyQuestAssignmentsTable.definitionId,
            "latency-daily-0",
          ),
        );
    let rows = await assignment();
    assert.equal(rows.find((a) => a.userId === "tutorial-user").progress, 40);
    await processBatch();
    rows = await assignment();
    assert.equal(rows.find((a) => a.userId === "tutorial-user").progress, 40);
    state.events.push({
      type: "CARD_PLAYED",
      playerId: "PLAYER_ONE",
      cardType: "WRESTLER",
    });
    await processBatch();
    rows = await assignment();
    assert.equal(rows.find((a) => a.userId === "tutorial-user").progress, 41);
    const ledgerBefore = await f.db
      .select()
      .from(f.schema.dailyQuestProgressEventsTable);
    const originalLog = f.db._.session.logger.logQuery;
    let injected = false;
    f.db._.session.logger.logQuery = (query, ...args) => {
      if (!injected && query.startsWith('update "daily_quest_assignments"')) {
        injected = true;
        throw Error("isolated mid-transaction failure");
      }
      originalLog(query, ...args);
    };
    try {
      await assert.rejects(
        () =>
          f.db.transaction(async (tx) =>
            quests.processMatchEventsForDailyQuests(
              "tutorial-user",
              "PLAYER_ONE",
              "latency-atomic",
              state,
              0,
              tx,
              undefined,
              "PVP",
            ),
          ),
        /mid-transaction failure/,
      );
    } finally {
      f.db._.session.logger.logQuery = originalLog;
    }
    assert.ok(injected);
    assert.equal(
      (await f.db.select().from(f.schema.dailyQuestProgressEventsTable)).length,
      ledgerBefore.length,
    );
    assert.equal(
      (await assignment()).find((a) => a.userId === "tutorial-user").progress,
      41,
    );
    await f.db.transaction(async (tx) =>
      quests.processMatchEventsForDailyQuests(
        "tutorial-user",
        "PLAYER_ONE",
        "latency-atomic",
        state,
        0,
        tx,
        undefined,
        "PVP",
      ),
    );
    assert.equal(
      (await assignment()).find((a) => a.userId === "tutorial-user").progress,
      82,
    );
    // Enough events to span multiple insert chunks, with the same target cap.
    state.events = Array.from({ length: 1100 }, () => ({
      type: "CARD_PLAYED",
      playerId: "PLAYER_ONE",
      cardType: "WRESTLER",
    }));
    await f.db.transaction(async (tx) =>
      quests.processMatchEventsForDailyQuests(
        "tutorial-user",
        "PLAYER_ONE",
        "latency-cap",
        state,
        0,
        tx,
        undefined,
        "PVP",
      ),
    );
    const capped = (await assignment()).find(
      (a) => a.userId === "tutorial-user",
    );
    assert.equal(capped.progress, 1000);
    assert.equal(capped.status, "COMPLETED");
    await f.db.transaction(async (tx) =>
      quests.processMatchEventsForDailyQuests(
        "tutorial-user",
        "PLAYER_ONE",
        "latency-cap",
        state,
        0,
        tx,
        undefined,
        "PVP",
      ),
    );
    assert.equal(
      (await assignment()).find((a) => a.userId === "tutorial-user").progress,
      1000,
    );
    if (process.env.KO_LATENCY_BASELINE !== "1") {
      // Actual TCP + WebSocket server, including compression negotiation,
      // per-seat privacy, a legacy uncompressed client and reconnect.
      const { WebSocket } =
        await import("../../artifacts/api-server/node_modules/ws/wrapper.mjs");
      const { attachOnlineMatchWebSocket } =
        await import("../../artifacts/api-server/src/online/websocket.ts");
      const { createWebSocketAuthTicket } =
        await import("../../artifacts/api-server/src/online/websocket-ticket.ts");
      const server = createServer();
      attachOnlineMatchWebSocket(server);
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const sockets = [];
      async function connect(user, compressed = true) {
        const socket = new WebSocket(
          `ws://127.0.0.1:${server.address().port}/api/online-matches/ws?ticket=${createWebSocketAuthTicket(user)}`,
          { perMessageDeflate: compressed },
        );
        sockets.push(socket);
        socket.messages = [];
        socket.on("message", (raw) =>
          socket.messages.push(JSON.parse(String(raw))),
        );
        await new Promise((resolve, reject) => {
          socket.once("open", resolve);
          socket.once("error", reject);
        });
        return socket;
      }
      async function waitMessage(socket, predicate) {
        const until = Date.now() + 10000;
        while (Date.now() < until) {
          const found = socket.messages.find(predicate);
          if (found) return found;
          await new Promise((r) => setTimeout(r, 10));
        }
        throw Error(
          "WebSocket response timeout: " +
            JSON.stringify(
              socket.messages.map((m) => ({ type: m.type, code: m.code })),
            ),
        );
      }
      try {
        const live = await fixture(),
          own = await connect("tutorial-user"),
          other = await connect("latency-opponent", false);
        assert.match(own.extensions, /permessage-deflate/);
        assert.equal(other.extensions, "");
        for (const socket of [own, other])
          socket.send(
            JSON.stringify({ type: "SUBSCRIBE", matchId: live.matchId }),
          );
        for (const socket of [own, other])
          await waitMessage(socket, (m) => m.type === "MATCH_SNAPSHOT");
        const bytesBefore = own._socket.bytesRead;
        own.send(
          JSON.stringify({
            type: "MATCH_ACTION",
            matchId: live.matchId,
            requestId: "socket-play",
            expectedVersion: live.version,
            action: {
              type: "PLAY_WRESTLER",
              cardInstanceId: "hand-0",
              boardSlot: 0,
            },
          }),
        );
        const views = await Promise.all(
          [own, other].map((socket) =>
            waitMessage(
              socket,
              (m) =>
                m.type === "ACTION_ACCEPTED" && m.requestId === "socket-play",
            ),
          ),
        );
        assert.equal(views[0].version, views[1].version);
        assert.equal(views[1].state.players[0].hand.hidden, true);
        assert.equal(views[0].state.players[0].board[0].instanceId, "hand-0");
        assert.equal(views[1].state.players[0].board[0].instanceId, "hand-0");
        const rawBytes = Buffer.byteLength(JSON.stringify(views[0])),
          wireBytes = own._socket.bytesRead - bytesBefore;
        assert.ok(wireBytes < rawBytes / 4, `${wireBytes} / ${rawBytes}`);
        metrics.webSocket = {
          rawBytes,
          wireBytes,
          legacyClient: true,
          bothViews: true,
        };
        // A replay must not pay twice or advance the version.
        own.send(
          JSON.stringify({
            type: "MATCH_ACTION",
            matchId: live.matchId,
            requestId: "socket-play",
            expectedVersion: 0,
            action: {
              type: "PLAY_WRESTLER",
              cardInstanceId: "hand-0",
              boardSlot: 0,
            },
          }),
        );
        const until = Date.now() + 5000;
        while (
          own.messages.filter(
            (m) =>
              m.type === "ACTION_ACCEPTED" && m.requestId === "socket-play",
          ).length < 2 &&
          Date.now() < until
        )
          await new Promise((r) => setTimeout(r, 10));
        assert.equal(live.state.players[0].currentGold, 5);
        assert.equal(live.version, views[0].version);
        own.close();
        await new Promise((resolve) => own.once("close", resolve));
        const reconnected = await connect("tutorial-user");
        reconnected.send(
          JSON.stringify({ type: "SUBSCRIBE", matchId: live.matchId }),
        );
        const restored = await waitMessage(
          reconnected,
          (m) => m.type === "MATCH_SNAPSHOT",
        );
        assert.equal(restored.state.players[0].board[0].instanceId, "hand-0");
        assert.equal(restored.version, live.version);
      } finally {
        for (const socket of sockets) socket.terminate();
        await new Promise((resolve) => server.close(resolve));
        // Close handlers flush their existing durable disconnect transitions.
        for (const id of ids) {
          const runtime = await service.getRuntime(id);
          if (runtime) await runtime.queue;
        }
      }
    }
    console.log("MULTIPLAYER_LATENCY", JSON.stringify(metrics));
    if (process.env.KO_LATENCY_REPORT)
      writeFileSync(
        process.env.KO_LATENCY_REPORT,
        JSON.stringify(metrics, null, 2),
      );
  } finally {
    collecting = false;
    for (const id of ids) service.cleanupMatchRuntime(id);
    await f.close();
  }
});
