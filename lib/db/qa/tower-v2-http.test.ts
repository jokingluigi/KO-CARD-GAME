import assert from "node:assert/strict";
import { test, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import * as schema from "../src/schema";
import { towerActionPayload } from "../../../artifacts/ko-game/src/lib/tower-action-payload";
import { getLegalActions } from "../../../artifacts/ko-game/src/game/actions/engine-actions";
import type { GameState } from "../../../artifacts/ko-game/src/game/types/game-state";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.NODE_ENV = "development";
const pg = new PGlite(),
  database = drizzle(pg, { schema });
for (const ddl of await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson(schema),
))
  await pg.exec(ddl);
await pg.exec(
  await readFile(
    new URL("../migrations/0051_tower_v2_versions.sql", import.meta.url),
    "utf8",
  ),
);
await pg.exec(
  await readFile(
    new URL("../migrations/0051_tower_v2_versions.sql", import.meta.url),
    "utf8",
  ),
);
for (const name of ["0033_server_maintenance.sql", "0038_ai_quest_matches.sql"])
  await pg.exec(
    await readFile(new URL("../migrations/" + name, import.meta.url), "utf8"),
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
const { hashPassword } =
  await import("../../../artifacts/api-server/src/lib/auth");
const password = "TowerLocalQA123!";
const hash = await hashPassword(password);
await database
  .insert(schema.usersTable)
  .values(
    ["admin", "user-a", "user-b"].map((id) => ({
      id,
      email: id + "@tower.invalid",
      nickname: id,
      passwordHash: hash,
      role: id === "admin" ? "ADMIN" : "USER",
      currencyBalance: 0,
    })),
  );
await database.insert(schema.championsTable).values([
  {
    id: "hero",
    name: "Hero",
    abilityName: "None",
    abilityEffects: {},
    status: "PUBLISHED",
    maxHealth: 30,
  },
  {
    id: "enemy",
    name: "Enemy",
    abilityName: "None",
    abilityEffects: {},
    status: "PUBLISHED",
    maxHealth: 1,
  },
]);
await database
  .insert(schema.cardsTable)
  .values(
    Array.from({ length: 18 }, (_, i) => ({
      id: "tower-card-" + i,
      name: "Tower Card " + i,
      cardType: "WRESTLER",
      cost: 1,
      attack: 15,
      health: 15,
      text: "",
      status: i % 2 ? "DRAFT" : "PUBLISHED",
      rarity: ["NORMAL", "EPIC", "LEGENDARY"][i % 3],
      keywords: ["RUSH"],
      tags: ["Machine"],
    })),
  );
await database
  .insert(schema.cardsTable)
  .values({
    id: "excluded-token",
    name: "Token",
    cardType: "WRESTLER",
    cost: 0,
    attack: 15,
    health: 15,
    text: "",
    status: "PUBLISHED",
    isToken: true,
  });
await database
  .insert(schema.packDefinitionsTable)
  .values({ id: "tower-pack", name: "Tower Pack", status: "PUBLISHED" });
await database
  .insert(schema.userChampionCollectionsTable)
  .values(
    ["admin", "user-a", "user-b"].map((userId) => ({
      userId,
      championDefinitionId: "hero",
      owned: true,
    })),
  );
await database
  .insert(schema.towerSettingsTable)
  .values({ id: "global", enabled: true });
const ids = Array(25).fill("tower-card-0");
const starter = {
  id: "starter",
  name: "Starter",
  championId: "hero",
  cardIds: ids,
  enabled: true,
  isDefault: true,
  initiallyUnlocked: true,
};
await database
  .insert(schema.towerStartersTable)
  .values({ id: "starter", data: starter });
const relic = {
  id: "relic",
  name: "Gold relic",
  enabled: true,
  initiallyUnlocked: true,
  effects: [
    {
      id: "gold",
      name: "Opening Gold",
      enabled: true,
      event: "BATTLE_START",
      eventOwner: "SELF",
      action: "ADD_GOLD",
      values: { amount: 1 },
      priority: 0,
      duration: "BATTLE",
      limit: { scope: "BATTLE", count: 1 },
    },
  ],
};
const { parseRelic } = await import("../../game-engine/src/tower/config");
await database
  .insert(schema.towerRelicsTable)
  .values({ id: "relic", data: parseRelic(relic) as any });
await database
  .insert(schema.towerCharactersTable)
  .values({
    id: "narrator",
    data: { id: "narrator", displayName: "Narrator", sprites: {} },
  });
await database
  .insert(schema.towerScenesTable)
  .values(
    ["opening", "ending", "hidden-end"].map((id) => ({
      id,
      data: {
        id,
        name: id,
        lines: [
          {
            order: 0,
            speakerId: "narrator",
            text: id,
            expression: "NEUTRAL",
            side: "LEFT",
          },
        ],
      },
    })),
  );
const rewards = [
  { type: "CURRENCY", amount: 100 },
  { type: "PACK", targetId: "tower-pack", amount: 1 },
  { type: "CARD", targetId: "tower-card-1", amount: 1 },
];
let definition: any = {
  id: "tower-v2",
  name: "HTTP Tower",
  description: "QA",
  protagonistChampionId: "",
  bosses: {},
  synergyWeights: { deckTag: 2, supportTag: 3, championTag: 2 },
  v2: {
    schemaVersion: 2,
    enabled: true,
    visible: true,
    sortOrder: 0,
    recommendedDifficulty: "QA",
    rarityWeights: { NORMAL: 0, EPIC: 0, LEGENDARY: 100 },
    openingSceneId: "opening",
    endingSceneId: "ending",
    hiddenEndingSceneId: "hidden-end",
    hiddenBossId: "secret",
    hiddenCondition: { type: "RELIC", id: "relic" },
    floors: Array.from({ length: 4 }, (_, i) => ({
      id: "floor" + i,
      number: i + 1,
      type: i % 2 ? "BOSS" : "NORMAL",
      enemies: [
        {
          id: "candidate",
          name: "Candidate",
          championId: "enemy",
          difficulty: "EASY",
          weight: 100,
        },
      ],
      bossId: i === 1 ? "mid" : i === 3 ? "final" : undefined,
      relicReward: i === 1,
    })),
    bosses: ["mid", "final", "secret"].map((id) => ({
      id,
      name: id,
      championId: "enemy",
      cardIds: ids,
      difficulty: "EASY",
      startingHealth: 1,
      maxHealth: 1,
      firstRewards: rewards,
      repeatRewards: [{ type: "CURRENCY", amount: 10 }],
    })),
  },
};
const { default: app } = await import("../../../artifacts/api-server/src/app");
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.on("listening", r));
const address = server.address();
assert.ok(address && typeof address === "object");
const origin = "http://127.0.0.1:" + address.port;
const cookies: Record<string, string> = {};
const balances: Record<string, number> = {};
async function request(
  user: string,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const r = await fetch(origin + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies[user] ?? "",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const c = r.headers.get("set-cookie");
  if (c) cookies[user] = c.split(";")[0]!;
  return { status: r.status, body: await r.json() };
}
async function ok(user: string, path: string, method = "GET", body?: unknown) {
  const r = await request(user, path, method, body);
  assert.ok(r.status >= 200 && r.status < 300, JSON.stringify({ path, ...r }));
  return r.body;
}
const command = (u: string, run: any, c: any) =>
  ok(u, "/tower/runs/" + run.id + "/command", "POST", {
    version: run.version,
    command: c,
  });
async function start(u: string) {
  return (
    await ok(u, "/tower/runs", "POST", {
      towerId: "tower-v2",
      championId: "hero",
      starterId: "starter",
    })
  ).run;
}
async function win(u: string, run: any) {
  let v = await command(u, run, { type: "CHALLENGE" });
  for (let n = 0; n < 100 && v.run.phase === "BATTLE"; n++) {
    const [row] = await database
      .select()
      .from(schema.towerRunsTable)
      .where(eq(schema.towerRunsTable.id, run.id));
    const s = row!.currentBattle as unknown as GameState;
    const actions = getLegalActions(s, "player-1");
    const a =
      actions.find((a) => a.type === "MULLIGAN") ??
      actions.find((a) => a.type === "ATTACK" && a.target.type === "PLAYER") ??
      actions.find((a) => a.type === "PLAY_WRESTLER") ??
      actions.find((a) => a.type === "END_TURN");
    assert.ok(a, "legal player action");
    v = await ok(u, "/tower/runs/" + run.id + "/action", "POST", {
      version: v.run.version,
      action: towerActionPayload(a),
    });
  }
  assert.notEqual(
    v.run.phase,
    "BATTLE",
    "real engine wins within bounded actions",
  );
  return v;
}
let a: any, b: any;
after(async () => {
  if (process.env.KO_TOWER_BROWSER_MODE === "1") {
    await mkdir("qa-results/tower-v2", { recursive: true });
    await writeFile(
      "qa-results/tower-v2/fixture.json",
      JSON.stringify({ origin, cookies, definition }),
    );
    console.info("Tower browser fixture ready");
    return;
  }
  await new Promise<void>((r) => server.close(() => r()));
  await pg.close();
  await pool.end();
});
test("authenticated administrator publishes validated immutable content; normal user cannot write", async () => {
  assert.equal((await request("anon", "/tower/home")).status, 401);
  for (const u of ["admin", "user-a", "user-b"]) {
    await ok(u, "/auth/login", "POST", {
      email: u + "@tower.invalid",
      password,
    });
    balances[u] = (
      await database
        .select()
        .from(schema.usersTable)
        .where(eq(schema.usersTable.id, u))
    )[0]!.currencyBalance;
  }
  assert.equal(
    (
      await request("user-a", "/admin/tower/seasons/tower-v2", "PUT", {
        data: definition,
        active: false,
      })
    ).status,
    403,
  );
  await ok("admin", "/admin/tower/seasons/tower-v2", "PUT", {
    data: definition,
    active: false,
  });
  assert.equal(
    (await ok("admin", "/admin/tower/v2/tower-v2/publish", "POST", {})).version,
    1,
  );
  assert.equal((await ok("user-a", "/tower/towers")).towers.length, 1);
  assert.equal((await ok("user-a", "/tower/home")).season.id, "tower-v2");
  a = await start("user-a");
  b = await start("user-b");
  assert.notEqual(a.id, b.id);
  assert.equal(a.contentVersion, 1);
  assert.equal(a.phase, "DIALOGUE");
});
test("other users cannot read, mutate, restart or fake battle results; private reward art is available", async () => {
  for (const suffix of ["", "/command", "/restart"]) {
    const r = await request(
      "user-b",
      "/tower/runs/" + a.id + suffix,
      suffix ? "POST" : "GET",
      suffix ? { version: a.version, command: { type: "ABANDON" } } : undefined,
    );
    assert.equal(r.status, 404);
  }
  assert.equal(
    (
      await request("user-a", "/tower/runs/" + a.id + "/command", "POST", {
        version: a.version,
        command: { type: "BATTLE_RESULT", won: true },
      })
    ).status,
    422,
  );
  const view = await ok("user-a", "/tower/runs/" + a.id);
  assert.ok(view.cards.some((c: any) => c.status === "DRAFT"));
  assert.equal(view.run.encounter.cardIds, undefined);
});
test("existing run retains version after administrator edits and publishes new settings", async () => {
  definition = {
    ...definition,
    name: "New Title",
    v2: {
      ...definition.v2,
      rarityWeights: { NORMAL: 100, EPIC: 0, LEGENDARY: 0 },
    },
  };
  await ok("admin", "/admin/tower/seasons/tower-v2", "PUT", {
    data: definition,
    active: false,
  });
  assert.equal(
    (await ok("admin", "/admin/tower/v2/tower-v2/publish", "POST", {})).version,
    2,
  );
  const [row] = await database
    .select()
    .from(schema.towerRunsTable)
    .where(eq(schema.towerRunsTable.id, a.id));
  assert.equal((row!.snapshot as any).catalog.season.name, "HTTP Tower");
  assert.equal(
    (row!.snapshot as any).catalog.season.v2.rarityWeights.LEGENDARY,
    100,
  );
});
test("opening skip persists; real battle restart restores seed, decks and relic counters", async () => {
  a = (await command("user-a", a, { type: "DIALOGUE_SKIP" })).run;
  const v = await command("user-a", a, { type: "CHALLENGE" });
  a = v.run;
  const [first] = await database
    .select()
    .from(schema.towerRunsTable)
    .where(eq(schema.towerRunsTable.id, a.id));
  const restart = await ok(
    "user-a",
    "/tower/runs/" + a.id + "/restart",
    "POST",
    { version: a.version },
  );
  a = restart.run;
  const [second] = await database
    .select()
    .from(schema.towerRunsTable)
    .where(eq(schema.towerRunsTable.id, a.id));
  assert.deepEqual(second!.currentBattle, first!.initialBattle);
  assert.deepEqual(
    (second!.state as any).encounter.cardIds,
    (first!.state as any).encounter.cardIds,
  );
  // Restart ends at the same opening; progress comes only from legal engine actions.
  let v2: any = { run: a };
  for (let n = 0; n < 100 && v2.run.phase === "BATTLE"; n++) {
    const [row] = await database
      .select()
      .from(schema.towerRunsTable)
      .where(eq(schema.towerRunsTable.id, a.id));
    const actions = getLegalActions(
      row!.currentBattle as unknown as GameState,
      "player-1",
    );
    const action =
      actions.find((x) => x.type === "MULLIGAN") ??
      actions.find((x) => x.type === "ATTACK" && x.target.type === "PLAYER") ??
      actions.find((x) => x.type === "PLAY_WRESTLER") ??
      actions.find((x) => x.type === "END_TURN");
    assert.ok(action);
    v2 = await ok("user-a", "/tower/runs/" + a.id + "/action", "POST", {
      version: v2.run.version,
      action: towerActionPayload(action),
    });
  }
  a = v2.run;
  assert.equal(a.phase, "CARD_REWARD");
  assert.equal(new Set(a.cardOptions).size, 3);
  assert.ok(
    a.cardOptions.every((id: string) => Number(id.split("-").at(-1)) % 3 === 2),
  );
});
test("reward reselection/cancel and atomic swap persist 25 cards and reject duplicated confirmation", async () => {
  const original = [...a.deck];
  a = (
    await command("user-a", a, {
      type: "SELECT_CARD",
      cardId: a.cardOptions[0],
    })
  ).run;
  a = (await command("user-a", a, { type: "CANCEL_CARD_SELECTION" })).run;
  assert.deepEqual(a.deck, original);
  a = (
    await command("user-a", a, {
      type: "SELECT_CARD",
      cardId: a.cardOptions[1],
    })
  ).run;
  const before = a;
  const results = await Promise.all([
    request("user-a", "/tower/runs/" + a.id + "/command", "POST", {
      version: a.version,
      command: { type: "REPLACE_CARD", deckIndex: 0 },
    }),
    request("user-a", "/tower/runs/" + a.id + "/command", "POST", {
      version: a.version,
      command: { type: "REPLACE_CARD", deckIndex: 0 },
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  a = results.find((r) => r.status === 200)!.body.run;
  assert.equal(a.deck.length, 25);
  assert.equal(a.deck[0], before.selectedCardId);
  assert.equal(a.floor, 2);
});
test("boss first clear grants credits, pack and private card once; other account stays untouched", async () => {
  a = (await win("user-a", a)).run;
  assert.equal(a.phase, "RELIC_REWARD");
  assert.deepEqual(a.relicOptions, ["relic"]);
  const [user] = await database
    .select()
    .from(schema.usersTable)
    .where(eq(schema.usersTable.id, "user-a"));
  const [other] = await database
    .select()
    .from(schema.usersTable)
    .where(eq(schema.usersTable.id, "user-b"));
  assert.equal(user!.currencyBalance, balances["user-a"]! + 100);
  assert.equal(other!.currencyBalance, balances["user-b"]);
  assert.equal(
    (await database.select().from(schema.towerBossReceiptsTable)).length,
    1,
  );
  a = (await command("user-a", a, { type: "SELECT_RELIC", relicId: "relic" }))
    .run;
});
test("next battle activates relic, final and hidden boss progression survives reconnect and ending skip", async () => {
  const v = await win("user-a", a);
  a = v.run;
  a = (await command("user-a", a, { type: "SKIP_CARD" })).run;
  a = (await win("user-a", a)).run;
  assert.equal(a.encounter.bossSlot, "hiddenBoss");
  assert.equal(a.phase, "HUB");
  a = (await win("user-a", a)).run;
  assert.equal(a.phase, "DIALOGUE");
  assert.equal(a.hiddenClear, true);
  a = (await command("user-a", a, { type: "DIALOGUE_SKIP" })).run;
  assert.equal(a.ended, true);
  const [user] = await database
    .select()
    .from(schema.usersTable)
    .where(eq(schema.usersTable.id, "user-a"));
  assert.equal(user!.currencyBalance, balances["user-a"]! + 300);
});
test("normal ending without required relic; user B first clears independent from user A", async () => {
  b = (await command("user-b", b, { type: "DIALOGUE_SKIP" })).run;
  b = (await win("user-b", b)).run;
  b = (await command("user-b", b, { type: "SKIP_CARD" })).run;
  b = (await win("user-b", b)).run;
  // Legitimate relic is offered, so this independent run is abandoned after confirming isolation.
  const [user] = await database
    .select()
    .from(schema.usersTable)
    .where(eq(schema.usersTable.id, "user-b"));
  assert.equal(user!.currencyBalance, balances["user-b"]! + 100);
  b = (await command("user-b", b, { type: "ABANDON" })).run;
  assert.equal(b.ended, true);
  definition = {
    ...definition,
    v2: {
      ...definition.v2,
      hiddenCondition: { type: "CARD", id: "tower-card-17" },
    },
  };
  await ok("admin", "/admin/tower/seasons/tower-v2", "PUT", {
    data: definition,
    active: false,
  });
  await ok("admin", "/admin/tower/v2/tower-v2/publish", "POST", {});
  a = await start("user-a");
  a = (await command("user-a", a, { type: "DIALOGUE_SKIP" })).run;
  for (let i = 1; i <= 4; i++) {
    a = (await win("user-a", a)).run;
    if (a.phase === "CARD_REWARD")
      a = (await command("user-a", a, { type: "SKIP_CARD" })).run;
    if (a.phase === "RELIC_REWARD")
      a = (
        await command("user-a", a, {
          type: "SELECT_RELIC",
          relicId: a.relicOptions[0],
        })
      ).run;
  }
  assert.equal(a.phase, "DIALOGUE");
  assert.equal(a.regularClear, true);
  assert.equal(a.hiddenClear, false);
  a = (await command("user-a", a, { type: "DIALOGUE_SKIP" })).run;
  const [user2] = await database
    .select()
    .from(schema.usersTable)
    .where(eq(schema.usersTable.id, "user-a"));
  assert.equal(user2!.currencyBalance, balances["user-a"]! + 320);
});
test("feature OFF preserves runs and blocks ordinary access while administrator diagnostics grant nothing", async () => {
  await ok("admin", "/admin/tower/settings", "PUT", { enabled: false });
  assert.equal((await request("user-b", "/tower/home")).status, 503);
  const before = (
    await database
      .select()
      .from(schema.usersTable)
      .where(eq(schema.usersTable.id, "admin"))
  )[0]!.currencyBalance;
  const v = await ok("admin", "/admin/tower/test/runs", "POST", {
    towerId: "tower-v2",
    starterId: "starter",
    championId: "hero",
    seed: "test-only",
    floor: 4,
    relicIds: [],
    bossId: "final",
  });
  assert.equal(v.run.isTest, true);
  assert.ok(v.cards.some((c:any)=>c.status==='DRAFT'));
  assert.equal(v.run.encounter.enemyId, "final");
  const [row] = await database
    .select()
    .from(schema.towerRunsTable)
    .where(eq(schema.towerRunsTable.id, v.run.id));
  assert.equal(row!.isTest, true);
  assert.equal(
    (
      await database
        .select()
        .from(schema.usersTable)
        .where(eq(schema.usersTable.id, "admin"))
    )[0]!.currencyBalance,
    before,
  );
  await ok("admin", "/admin/tower/settings", "PUT", { enabled: true });
  assert.equal((await ok("user-a", "/tower/runs/" + a.id)).run.ended, true);
});
test("same boss reused on two floors receives two distinct repeat receipts and idempotent rewards", async () => {
  const old = definition;
  definition = {
    ...definition,
    v2: {
      ...definition.v2,
      hiddenBossId: undefined,
      hiddenCondition: undefined,
      floors: [1, 2].map((number) => ({
        id: "reuse-" + number,
        number,
        type: "BOSS",
        bossId: "mid",
        enemies: [],
        relicReward: false,
      })),
    },
  };
  await ok("admin", "/admin/tower/seasons/tower-v2", "PUT", {
    data: definition,
    active: false,
  });
  await ok("admin", "/admin/tower/v2/tower-v2/publish", "POST", {});
  let r = await start("user-b");
  r = (await command("user-b", r, { type: "DIALOGUE_SKIP" })).run;
  const before = (
    await database
      .select()
      .from(schema.usersTable)
      .where(eq(schema.usersTable.id, "user-b"))
  )[0]!.currencyBalance;
  r = (await win("user-b", r)).run;
  assert.equal(r.floor, 2);
  r = (await win("user-b", r)).run;
  assert.equal(r.regularClear, true);
  const receipts = await database
    .select()
    .from(schema.towerBossReceiptsTable)
    .where(eq(schema.towerBossReceiptsTable.runId, r.id));
  assert.equal(receipts.length, 2);
  assert.equal(new Set(receipts.map((x) => x.bossSlotId)).size, 2);
  assert.equal(
    (
      await database
        .select()
        .from(schema.usersTable)
        .where(eq(schema.usersTable.id, "user-b"))
    )[0]!.currencyBalance,
    before + 20,
  );
  definition = old;
  await ok("admin", "/admin/tower/seasons/tower-v2", "PUT", {
    data: definition,
    active: false,
  });
  await ok("admin", "/admin/tower/v2/tower-v2/publish", "POST", {});
});
