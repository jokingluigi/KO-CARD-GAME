import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { getTableColumns } from "drizzle-orm";
import * as schema from "../src/schema";
import {
  cardRecordToDefinition,
  championRecordToDefinition,
  createInitialGameState,
  generateCardInstance,
} from "../../game-engine/src";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.NODE_ENV = "development";
const pg = new PGlite(),
  database = drizzle(pg, { schema });
for (const ddl of await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson(schema),
))
  await pg.exec(ddl);
for (const file of ["0033_server_maintenance.sql", "0038_ai_quest_matches.sql"])
  await pg.exec(
    await readFile(new URL("../migrations/" + file, import.meta.url), "utf8"),
  );
const folder = new URL(
  "../../../docs/qa/snapshots/20261013-admin/",
  import.meta.url,
);
const cards = JSON.parse(await readFile(new URL("cards.json", folder), "utf8"));
const champions = JSON.parse(
  await readFile(new URL("champions.json", folder), "utf8"),
);
const tower = JSON.parse(await readFile(new URL("tower.json", folder), "utf8"));
function columns(table: any, rows: any[]) {
  const allowed = Object.keys(getTableColumns(table));
  return rows.map((row) =>
    Object.fromEntries(
      allowed
        .filter((k) => k in row)
        .map((k) => [
          k,
          ["createdAt", "updatedAt"].includes(k) && row[k]
            ? new Date(row[k])
            : row[k],
        ]),
    ),
  );
}
await database
  .insert(schema.cardsTable)
  .values(columns(schema.cardsTable, cards));
await database
  .insert(schema.championsTable)
  .values(columns(schema.championsTable, champions));
for (const [key, table] of Object.entries({
  seasons: schema.towerSeasonsTable,
  starters: schema.towerStartersTable,
  presets: schema.towerPresetsTable,
  relics: schema.towerRelicsTable,
  characters: schema.towerCharactersTable,
  scenes: schema.towerScenesTable,
  metadata: schema.towerMetadataTable,
}))
  if (tower[key].length)
    await database.insert(table).values(columns(table, tower[key]) as any);
await database
  .insert(schema.towerSettingsTable)
  .values({ id: "global", enabled: false });
const { db, pool } = await import("../src/index");
for (const method of [
  "select",
  "insert",
  "update",
  "delete",
  "execute",
  "transaction",
] as const)
  Object.assign(db, { [method]: database[method].bind(database) });
const { hashPassword } =
  await import("../../../artifacts/api-server/src/lib/auth");
const hash = await hashPassword("LocalOnlyAudit123");
await database
  .insert(schema.usersTable)
  .values(
    ["a", "b", "outsider"].map((id) => ({
      id: "audit-" + id,
      email: id + "@local-audit.invalid",
      nickname: "audit-" + id,
      passwordHash: hash,
      role: "USER" as const,
      shopCurrencyStarterGrantedAt: new Date(),
    })),
  );
const deckIds = cards
  .filter(
    (c: any) =>
      c.status === "PUBLISHED" &&
      !c.isToken &&
      !c.isChampionToken &&
      c.cost <= 6,
  )
  .slice(0, 25)
  .map((c: any) => c.id);
assert.equal(deckIds.length, 25);
await database
  .insert(schema.decksTable)
  .values(
    ["a", "b"].map((id) => ({
      id: "audit-deck-" + id,
      userId: "audit-" + id,
      name: "Audit deck " + id,
      championDefinitionId: "bcffab96-f61f-497e-b60b-de5a869837d3",
      cardDefinitionIds: deckIds,
    })),
  );
const { default: app } = await import("../../../artifacts/api-server/src/app");
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.on("listening", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const origin = `http://127.0.0.1:${address.port}`;
const cookies = new Map<string, string>();
async function request(user: string, path: string, body?: unknown) {
  const response = await fetch(origin + "/api" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies.get(user) ?? "",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const cookie = response.headers.get("set-cookie");
  if (cookie) cookies.set(user, cookie.split(";")[0]);
  return { status: response.status, body: (await response.json()) as any };
}
for (const user of ["a", "b", "outsider"])
  assert.equal(
    (
      await request(user, "/auth/login", {
        email: user + "@local-audit.invalid",
        password: "LocalOnlyAudit123",
      })
    ).status,
    200,
  );
const definitions = cards.map(cardRecordToDefinition),
  championDefinitions = champions.map(championRecordToDefinition);
const caster = definitions.find((d: any) => d.name === "카스토")!,
  target = definitions.find((d: any) => d.name === "로드")!;
const state = createInitialGameState(
  [
    "bcffab96-f61f-497e-b60b-de5a869837d3",
    "bcffab96-f61f-497e-b60b-de5a869837d3",
  ],
  definitions,
  championDefinitions,
  [deckIds, deckIds],
  { randomSeed: 42, gameId: "current-admin-pvp" },
);
state.players[0].id = "PLAYER_ONE";
state.players[1].id = "PLAYER_TWO";
state.activePlayerId = "PLAYER_ONE";
state.status = "IN_PROGRESS";
state.turn = 13;
for (const player of state.players) {
  player.hand = [];
  player.board = [null, null, null, null];
  player.currentGold = 6;
  player.personalTurn = 6;
}
state.players[0].board[0] = {
  ...generateCardInstance(caster, { instanceId: "caster" }),
  boardSlot: 0,
  enteredThisTurn: false,
};
state.players[0].board[1] = {
  ...generateCardInstance(target, { instanceId: "ally" }),
  boardSlot: 1,
  currentHealth: 2,
  enteredThisTurn: false,
};
state.players[1].hand = [
  generateCardInstance(target, { instanceId: "opponent-private-instance" }),
];
await database.insert(schema.onlineMatchesTable).values({
  id: "current-admin-pvp",
  status: "ACTIVE",
  player1UserId: "audit-a",
  player2UserId: "audit-b",
  player1DeckId: "audit-deck-a",
  player2DeckId: "audit-deck-b",
  serializedGameState: state,
  stateVersion: 0,
  startedAt: new Date(Date.now() - 60000),
  gameplayStartsAt: new Date(Date.now() - 60000),
  serializedSnapshot: {
    player1UserId: "audit-a",
    player2UserId: "audit-b",
    player1DeckId: "audit-deck-a",
    player2DeckId: "audit-deck-b",
    cardDefinitions: definitions,
    championDefinitions,
    publicPlayers: [
      { seat: "PLAYER_ONE", nickname: "Audit A" },
      { seat: "PLAYER_TWO", nickname: "Audit B" },
    ],
    introFirstSpeaker: null,
  },
});
after(async () => {
  const { getRuntime, cleanupMatchRuntime } =
    await import("../../../artifacts/api-server/src/online/service");
  const runtime = await getRuntime("current-admin-pvp");
  if (runtime) {
    await runtime.queue;
    runtime.state = { ...runtime.state, status: "FINISHED" };
    cleanupMatchRuntime("current-admin-pvp");
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
  await pg.close();
});
test("latest Casto active runs through authenticated PvP HTTP, syncs both clients and protects opponent hidden hand", async () => {
  const start = await request("a", "/online-matches/current-admin-pvp/action", {
    requestId: "cast",
    expectedVersion: 0,
    action: {
      type: "BEGIN_TARGETED_ACTION",
      action: { type: "USE_ACTIVE", cardInstanceId: "caster" },
    },
  });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const deny = await request("b", "/online-matches/current-admin-pvp/action", {
    requestId: "wrong-seat",
    expectedVersion: 1,
    action: { type: "CONFIRM_PRECOMMIT_TARGET", targetId: "ally" },
  });
  assert.equal(deny.status, 409);
  const complete = await request(
    "a",
    "/online-matches/current-admin-pvp/action",
    {
      requestId: "target",
      expectedVersion: 1,
      action: { type: "CONFIRM_PRECOMMIT_TARGET", targetId: "ally" },
    },
  );
  assert.equal(complete.status, 200, JSON.stringify(complete.body));
  const { getRuntime } =
    await import("../../../artifacts/api-server/src/online/service");
  const runtime = (await getRuntime("current-admin-pvp"))!;
  assert.equal(
    runtime.state.players[0].board[0]?.currentAttack,
    caster.attack + 2,
  );
  const views = await Promise.all([
    request("a", "/online-matches/current-admin-pvp"),
    request("b", "/online-matches/current-admin-pvp"),
  ]);
  for (const view of views) assert.equal(view.status, 200);
  assert.equal(
    JSON.stringify(views[0].body).includes("opponent-private-instance"),
    false,
  );
  assert.equal(
    JSON.stringify(views[1].body).includes("opponent-private-instance"),
    true,
  );
  const outsider = await request(
    "outsider",
    "/online-matches/current-admin-pvp",
  );
  assert.equal(outsider.status, 404);
  const stale = await request("a", "/online-matches/current-admin-pvp/action", {
    requestId: "stale",
    expectedVersion: 0,
    action: { type: "USE_ACTIVE", cardInstanceId: "caster" },
  });
  assert.equal(stale.status, 409);
  assert.equal(
    runtime.state.players[0].board[0]?.currentAttack,
    caster.attack + 2,
  );
});
test("current tower configuration is loaded and validated offline without enabling the production tower", async () => {
  const { loadTowerSnapshot } =
    await import("../../../artifacts/api-server/src/lib/tower-catalog");
  const snapshot = await loadTowerSnapshot(db, tower.seasons[0].id, true);
  assert.equal(snapshot.catalog.season.v2?.floors.length, 16);
  assert.equal(snapshot.catalog.relics.length, 24);
  assert.ok(snapshot.cards.some((c) => c.id === caster.id));
  assert.equal(tower.enabled, false);
});
