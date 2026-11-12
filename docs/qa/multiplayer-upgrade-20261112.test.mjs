import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import {
  CatalogEncoder,
  CatalogDecoder,
  cloneBattleState,
} from "../../lib/game-engine/src/online-catalog.ts";
import { createInitialGameState } from "../../artifacts/ko-game/src/game/engine/create-initial-game-state.ts";
import { generateCardInstance } from "../../artifacts/ko-game/src/game/cards/generation.ts";
import { cardRecordToDefinition } from "../../artifacts/ko-game/src/game/cards/published-cards.ts";
import { championRecordToDefinition } from "../../artifacts/ko-game/src/game/champions/published-champions.ts";
import { executeAction } from "../../artifacts/ko-game/src/game/actions/engine-actions.ts";
import { normalizePandoraTargeting } from "../../artifacts/ko-game/src/game/champions/pandora-targeting.ts";
import { BattleSocketSender } from "../../artifacts/api-server/src/online/socket-sender.ts";
import { shortLivedRead } from "../../artifacts/api-server/src/lib/short-lived-read.ts";
import { eq, sql } from "../../lib/db/node_modules/drizzle-orm/index.js";
import { createServer } from "node:http";
let f, service, outbox;
const ids = [];
const unit = {
  id: "upgrade-unit",
  name: "격리 선수",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 1,
  attack: 1,
  health: 4,
  abilities: [],
  keywords: [],
  rulesText: "",
};
const records = JSON.parse(
  readFileSync("docs/qa/snapshots/20261111-admin/champions.json"),
);
const pandora = championRecordToDefinition({
  ...records.find((c) => c.id === "bcffab96-f61f-497e-b60b-de5a869837d3"),
  questText: "상대 선수 카드를 핀폴로 8회 리타이어시키기",
  abilityText:
    "자신이 선택한 선수 카드에게 1 데미지를 줍니다. 핀폴로 처치했다면 체력을 2 회복합니다.",
});
before(async () => {
  f = await startTutorialFixture();
  service = await import("../../artifacts/api-server/src/online/service.ts");
  outbox =
    await import("../../artifacts/api-server/src/lib/quest-progress-outbox.ts");
  await f.db
    .insert(f.schema.usersTable)
    .values({
      id: "upgrade-opponent",
      email: "upgrade@example.invalid",
      nickname: "상대",
      passwordHash: "unusable",
    });
  await f.db.insert(f.schema.decksTable).values([
    { id: "upgrade-deck-1", userId: "tutorial-user", name: "격리" },
    { id: "upgrade-deck-2", userId: "upgrade-opponent", name: "격리" },
  ]);
  await f.db
    .insert(f.schema.dailyQuestDefinitionsTable)
    .values({
      id: "upgrade-play-quest",
      title: "사용",
      description: "격리",
      objectiveType: "CARD_PLAYED",
      targetValue: 10,
      rewardType: "CURRENCY",
      rewardAmount: 10,
    });
});
after(async () => {
  for (const id of ids) service.cleanupMatchRuntime(id);
  await f.close();
});
function state() {
  const s = createInitialGameState([pandora.id, pandora.id], [unit], [pandora]);
  Object.assign(s, {
    gameId: "upgrade-" + ids.length,
    status: "IN_PROGRESS",
    turn: 3,
    activePlayerId: "PLAYER_ONE",
    openingMulligan: false,
    events: [],
  });
  s.players = s.players.map((p, i) => ({
    ...p,
    id: i ? "PLAYER_TWO" : "PLAYER_ONE",
    health: 10,
    currentGold: 6,
    hand: [generateCardInstance(unit, { instanceId: "hand-" + i })],
    deck: [],
    board: [
      {
        ...generateCardInstance(unit, { instanceId: "target-" + i }),
        currentHealth: 1,
        boardSlot: 0,
      },
      null,
      null,
      null,
    ],
  }));
  return s;
}
async function fixture() {
  const s = state(),
    id = s.gameId;
  s.cardPool = [
    ...JSON.parse(
      readFileSync("docs/qa/snapshots/20261111-admin/cards.json"),
    ).map(cardRecordToDefinition),
    unit,
  ];
  ids.push(id);
  await f.db
    .insert(f.schema.onlineMatchesTable)
    .values({
      id,
      status: "ACTIVE",
      player1UserId: "tutorial-user",
      player2UserId: "upgrade-opponent",
      player1DeckId: "upgrade-deck-1",
      player2DeckId: "upgrade-deck-2",
      serializedGameState: s,
      serializedSnapshot: {
        player1UserId: "tutorial-user",
        player2UserId: "upgrade-opponent",
        player1DeckId: "upgrade-deck-1",
        player2DeckId: "upgrade-deck-2",
        cardDefinitions: s.cardPool,
        championDefinitions: [pandora],
        publicPlayers: [
          { userId: "tutorial-user" },
          { userId: "upgrade-opponent" },
        ],
        introFirstSpeaker: null,
      },
    });
  return service.getRuntime(id);
}
test("catalog negotiation reuses definitions and applies additions, edits, removals and resync", () => {
  const encoder = new CatalogEncoder(),
    decoder = new CatalogDecoder();
  const s = state();
  const initial = encoder.encode({
    type: "MATCH_SNAPSHOT",
    matchId: "a",
    state: s,
  });
  assert.deepEqual(decoder.decode(initial).state.cardPool, [unit]);
  const unchanged = encoder.encode({
    type: "ACTION_ACCEPTED",
    matchId: "a",
    state: { ...s, turn: 4 },
  });
  assert.equal(unchanged.state.cardPool, undefined);
  assert.equal(decoder.decode(unchanged).state.cardPool, s.cardPool);
  const added = { ...unit, id: "generated" },
    updated = { ...unit, cost: 3 };
  const change = encoder.encode({
    type: "ACTION_ACCEPTED",
    matchId: "a",
    state: { ...s, cardPool: [updated, added], minionACardPool: [added] },
  });
  assert.deepEqual(decoder.decode(change).state.cardPool, [updated, added]);
  const removed = encoder.encode({
    type: "ACTION_ACCEPTED",
    matchId: "a",
    state: { ...s, cardPool: [added] },
  });
  assert.deepEqual(decoder.decode(removed).state.cardPool, [added]);
  assert.equal(new CatalogDecoder().decode(removed), null);
  assert.deepEqual(
    decoder.decode(
      encoder.encode({ type: "RESYNC_REQUIRED", matchId: "a", state: s }),
    ).state.cardPool,
    [unit],
  );
  const clone = cloneBattleState(s);
  assert.equal(clone.cardPool, s.cardPool);
  assert.notEqual(clone.players, s.players);
  assert.throws(() => {
    clone.cardPool[0].cost = 99;
  }, TypeError);
  assert.equal(s.players[0].health, 10);
  const result = executeAction(clone, {
    type: "PLAY_WRESTLER",
    playerId: "PLAYER_ONE",
    cardInstanceId: "hand-0",
    boardSlot: 1,
  });
  assert.ok(result.success);
  assert.equal(s.players[0].hand.length, 1);
});
test("slow sender keeps all acknowledgements/events and valid catalog base while coalescing obsolete states", async () => {
  const sent = [],
    socket = {
      readyState: 1,
      bufferedAmount: 0,
      send: (s) => sent.push(JSON.parse(s)),
      close() {
        this.readyState = 3;
      },
    };
  const sender = new BattleSocketSender(socket, () => true),
    s = state();
  sender.send({
    type: "MATCH_SNAPSHOT",
    matchId: "wire",
    version: 0,
    state: s,
    events: [],
  });
  socket.bufferedAmount = 200000;
  for (let i = 1; i <= 3; i++)
    sender.send({
      type: "ACTION_ACCEPTED",
      matchId: "wire",
      requestId: "r" + i,
      version: i,
      state: { ...s, turn: i },
      events: [{ sequenceNumber: i - 1, event: { type: "TURN_ENDED" } }],
    });
  assert.equal(sent.length, 1);
  socket.bufferedAmount = 0;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(sent.length, 2);
  assert.equal(sent[1].version, 3);
  assert.equal(sent[1].acknowledgedRequests.length, 3);
  assert.deepEqual(
    sent[1].events.map((e) => e.sequenceNumber),
    [0, 1, 2],
  );
  const decoder = new CatalogDecoder();
  decoder.decode(sent[0]);
  assert.equal(decoder.decode(sent[1]).state.cardPool[0].id, unit.id);
  sender.dispose();
});
test("maintenance shared read coalesces concurrent callers, expires, invalidates, and never caches failure", async () => {
  let now = 0,
    calls = 0,
    fail = false;
  const cache = shortLivedRead(
    async () => {
      calls++;
      if (fail) throw Error("offline");
      return calls;
    },
    1000,
    () => now,
  );
  assert.deepEqual(
    await Promise.all([cache.get(), cache.get(), cache.get()]),
    [1, 1, 1],
  );
  assert.equal(calls, 1);
  now = 1001;
  assert.equal(await cache.get(), 2);
  cache.invalidate();
  fail = true;
  await assert.rejects(cache.get(), /offline/);
  fail = false;
  assert.equal(await cache.get(), 4);
});
test("Pandora preparation completes at eight actual opposing pinfalls, never at five or seven", () => {
  let s = state();
  const champion = s.players[0].champion;
  champion.quest = {
    ...champion.quest,
    finisher: undefined,
    finisherChoices: undefined,
    reward: { type: "GAIN_GOLD", amount: 0 },
  };
  for (let i = 1; i <= 8; i++) {
    s.players[0].board[0] = {
      ...generateCardInstance(unit, { instanceId: "attacker-" + i }),
      boardSlot: 0,
      enteredThisTurn: false,
    };
    s.players[1].board[0] = {
      ...generateCardInstance(unit, { instanceId: "victim-" + i }),
      currentHealth: 1,
      boardSlot: 0,
      enteredThisTurn: false,
    };
    const result = executeAction(s, {
      type: "ATTACK",
      playerId: "PLAYER_ONE",
      attackerInstanceId: "attacker-" + i,
      target: {
        type: "WRESTLER",
        playerId: "PLAYER_TWO",
        cardInstanceId: "victim-" + i,
      },
    });
    assert.ok(result.success, result.message);
    s = result.state;
    assert.equal(s.players[0].champion.questCompleted, i === 8, "pinfall " + i);
  }
  const old = state();
  old.players[0].champion.quest.condition.required = 5;
  old.players[0].champion.quest.requiredProgress = 5;
  assert.equal(
    normalizePandoraTargeting(old).players[0].champion.quest.requiredProgress,
    8,
  );
  old.players[0].champion.questCompleted = true;
  assert.equal(
    normalizePandoraTargeting(old).players[0].champion.quest.requiredProgress,
    5,
  );
});
test("atomic Pandora targeting uses one state version, one gold and one target; invalid target commits nothing", async () => {
  const r = await fixture(),
    before = r.version;
  let action = await service.applyMatchAction(
    r.matchId,
    "tutorial-user",
    "bad",
    before,
    {
      type: "COMMIT_TARGETED_ACTION",
      action: { type: "USE_CHAMPION_ABILITY" },
      targetId: "PLAYER_TWO",
    },
  );
  assert.equal(action.ok, false);
  assert.equal(r.version, before);
  assert.equal(r.state.players[0].currentGold, 6);
  action = await service.applyMatchAction(
    r.matchId,
    "tutorial-user",
    "once",
    before,
    {
      type: "COMMIT_TARGETED_ACTION",
      action: { type: "USE_CHAMPION_ABILITY" },
      targetId: "target-1",
    },
  );
  assert.ok(action.ok, action.message);
  assert.equal(r.version, before + 1);
  assert.equal(r.state.players[0].currentGold, 5);
  assert.equal(r.state.players[0].health, 12);
  assert.equal(r.state.players[1].graveyard.length, 1);
  assert.ok(
    (
      await service.applyMatchAction(
        r.matchId,
        "tutorial-user",
        "once",
        before,
        {
          type: "COMMIT_TARGETED_ACTION",
          action: { type: "USE_CHAMPION_ABILITY" },
          targetId: "target-1",
        },
      )
    ).duplicate,
  );
  assert.equal(r.state.players[0].champion.quest.requiredProgress, 8);
});
test("durable progression survives runtime reload, uses captured configuration and flushes before reward reads", async () => {
  const r = await fixture();
  const result = await service.applyMatchAction(
    r.matchId,
    "tutorial-user",
    "play",
    r.version,
    { type: "PLAY_WRESTLER", cardInstanceId: "hand-0", boardSlot: 1 },
  );
  assert.ok(result.ok);
  const pending = await f.db.select().from(f.schema.questProgressOutboxTable);
  assert.ok(pending.length);
  await f.db
    .update(f.schema.dailyQuestDefinitionsTable)
    .set({ enabled: false })
    .where(eq(f.schema.dailyQuestDefinitionsTable.id, "upgrade-play-quest"));
  const logger = f.db._.session.logger,
    oldLog = logger.logQuery;
  let injected = false;
  logger.logQuery = (query, ...args) => {
    if (!injected && query.startsWith('update "daily_quest_assignments"')) {
      injected = true;
      throw Error("injected outbox write failure");
    }
    oldLog.call(logger, query, ...args);
  };
  f.db._.session.options.logger = logger;
  try {
    await assert.rejects(async () => {
      for (let i = 0; i < 10 && !injected; i++)
        await outbox.processNextQuestProgress();
    });
  } finally {
    logger.logQuery = oldLog;
  }
  assert.ok(injected);
  assert.ok(
    (await f.db.select().from(f.schema.questProgressOutboxTable)).some(
      (j) => j.matchId === r.matchId && j.attempts === 1,
    ),
  );
  assert.equal(
    (await f.db.select().from(f.schema.dailyQuestProgressEventsTable)).length,
    0,
  );
  service.cleanupMatchRuntime(r.matchId);
  const restored = await service.getRuntime(r.matchId);
  assert.equal(restored.state.players[0].board[1].instanceId, "hand-0");
  const response = await fetch(f.origin + "/api/daily-quests", {
    headers: { Cookie: f.cookie },
  });
  assert.equal(response.status, 200);
  const rows = await f.db.select().from(f.schema.dailyQuestAssignmentsTable);
  assert.equal(
    rows.find(
      (a) =>
        a.userId === "tutorial-user" && a.definitionId === "upgrade-play-quest",
    ).progress,
    1,
  );
  assert.equal(
    (await f.db.select().from(f.schema.questProgressOutboxTable)).length,
    0,
  );
  await outbox.flushQuestProgress("tutorial-user");
  const afterRows = await f.db
    .select()
    .from(f.schema.dailyQuestAssignmentsTable);
  assert.equal(
    afterRows.find(
      (a) =>
        a.userId === "tutorial-user" && a.definitionId === "upgrade-play-quest",
    ).progress,
    1,
  );
});
test("actual WebSocket clients negotiate compact catalogs, atomically target and report client timing", async () => {
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
  const r = await fixture();
  async function connect(user) {
    const socket = new WebSocket(
        `ws://127.0.0.1:${server.address().port}/api/online-matches/ws?ticket=${createWebSocketAuthTicket(user)}`,
      ),
      decoder = new CatalogDecoder();
    sockets.push(socket);
    socket.raw = [];
    socket.views = [];
    socket.on("message", (raw) => {
      const parsed = JSON.parse(String(raw));
      socket.raw.push(parsed);
      const view = decoder.decode(parsed);
      assert.ok(view, "catalog base mismatch");
      socket.views.push(view);
    });
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    return socket;
  }
  async function wait(socket, type) {
    for (let i = 0; i < 500; i++) {
      const message = socket.views.find((m) => m.type === type);
      if (message) return message;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw Error(
      "missing " +
        type +
        JSON.stringify(socket.raw.map((m) => ({ type: m.type, code: m.code }))),
    );
  }
  try {
    const own = await connect("tutorial-user"),
      other = await connect("upgrade-opponent");
    for (const socket of sockets)
      socket.send(
        JSON.stringify({
          type: "SUBSCRIBE",
          matchId: r.matchId,
          catalogProtocol: 1,
        }),
      );
    for (const socket of sockets)
      assert.ok(
        (await wait(socket, "MATCH_SNAPSHOT")).state.cardPool.length > 100,
      );
    own.send(
      JSON.stringify({
        type: "MATCH_ACTION",
        matchId: r.matchId,
        requestId: "atomic-socket",
        expectedVersion: r.version,
        action: {
          type: "COMMIT_TARGETED_ACTION",
          action: { type: "USE_CHAMPION_ABILITY" },
          targetId: "target-1",
        },
      }),
    );
    const a = await wait(own, "ACTION_ACCEPTED"),
      b = await wait(other, "ACTION_ACCEPTED");
    assert.equal(a.version, b.version);
    assert.equal(a.state.players[0].health, 12);
    assert.ok(a.state.cardPool.length > 100);
    assert.equal(
      own.raw.find((m) => m.type === "ACTION_ACCEPTED").state.cardPool,
      undefined,
    );
    assert.equal(b.state.players[0].hand.hidden, true);
    own.send(
      JSON.stringify({
        type: "PERFORMANCE_SAMPLE",
        matchId: r.matchId,
        samples: [
          { kind: "actionAckMs", value: 123 },
          { kind: "frameGapMs", value: 17 },
        ],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    const metrics = await fetch(
      f.origin + "/api/admin/multiplayer-performance",
      { headers: { Cookie: f.cookie } },
    ).then((r) => r.json());
    assert.ok(metrics.metrics["client.actionAckMs"].count > 0);
  } finally {
    for (const socket of sockets) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    await r.queue;
    await outbox.flushQuestProgress("tutorial-user");
  }
});
test("admin metrics are protected and show observed stages plus durable queue", async () => {
  assert.equal(
    (await fetch(f.origin + "/api/admin/multiplayer-performance")).status,
    401,
  );
  const result = await fetch(f.origin + "/api/admin/multiplayer-performance", {
    headers: { Cookie: f.cookie },
  });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.ok(body.metrics.actionMs.count > 0);
  assert.equal(body.progressQueue.pending, 0);
});
test("full published catalog stays immutable across cloned actions and reorder patches preserve order", () => {
  const s = state();
  s.cardPool = JSON.parse(
    readFileSync("docs/qa/snapshots/20261111-admin/cards.json"),
  ).map(cardRecordToDefinition);
  const candidate = cloneBattleState(s),
    copy = cloneBattleState(candidate);
  assert.equal(copy.cardPool, s.cardPool);
  assert.ok(Object.isFrozen(s.cardPool));
  assert.ok(Object.isFrozen(s.cardPool[0].abilities));
  const encoder = new CatalogEncoder(),
    decoder = new CatalogDecoder();
  const full = encoder.encode({
    type: "MATCH_SNAPSHOT",
    matchId: "measure",
    state: s,
  });
  decoder.decode(full);
  const next = encoder.encode({
    type: "ACTION_ACCEPTED",
    matchId: "measure",
    state: { ...s, turn: 4 },
  });
  assert.equal(decoder.decode(next).state.cardPool, s.cardPool);
  const fullBytes = Buffer.byteLength(JSON.stringify(full)),
    updateBytes = Buffer.byteLength(JSON.stringify(next));
  assert.ok(updateBytes < fullBytes * 0.35);
  console.log(
    "CATALOG_TRANSFER",
    JSON.stringify({
      fullBytes,
      updateBytes,
      reductionPercent: Math.round((1 - updateBytes / fullBytes) * 100),
    }),
  );
  const reversed = [...s.cardPool].reverse();
  const changed = encoder.encode({
    type: "ACTION_ACCEPTED",
    matchId: "measure",
    state: { ...s, cardPool: reversed },
  });
  assert.deepEqual(
    decoder.decode(changed).state.cardPool.map((c) => c.id),
    reversed.map((c) => c.id),
  );
});
