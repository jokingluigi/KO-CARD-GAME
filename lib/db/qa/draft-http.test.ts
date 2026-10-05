// Local-only, isolated PostgreSQL fixture for Draft HTTP verification.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../src/schema";
import { readFile } from "node:fs/promises";
import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.NODE_ENV = "development";
const pg = new PGlite();
const database = drizzle(pg, { schema });
for (const ddl of await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson(schema),
))
  await pg.exec(ddl);
await pg.exec(
  await readFile(
    new URL("../migrations/0033_server_maintenance.sql", import.meta.url),
    "utf8",
  ),
);
const { db } = await import("../src/index");
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
await database.insert(schema.usersTable).values(
  ["admin", "user", "opponent", "third"].map((id) => ({
    id,
    email: `${id}@epic.invalid`,
    nickname: `EPIC ${id}`,
    passwordHash: "placeholder",
    role: id === "user" ? ("USER" as const) : ("ADMIN" as const),
    currencyBalance: 1000,
    shopCurrencyStarterGrantedAt: new Date(),
  })),
);
await database
  .update(schema.usersTable)
  .set({ passwordHash: await hashPassword("EpicLocalQA123") });
const cards = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, rarity: "NORMAL" })),
  ...Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, rarity: "EPIC" })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `l${i}`,
    rarity: "LEGENDARY",
  })),
].map((c) => ({
  ...c,
  name: `${c.rarity} ${c.id}`,
  cardType: "WRESTLER",
  cost: 1,
  attack: 2,
  health: 3,
  text: "검증용 카드",
  status: "PUBLISHED",
}));
await database.insert(schema.cardsTable).values(cards);
await database.insert(schema.championsTable).values({
  id: "hero",
  name: "QA Champion",
  abilityName: "응원",
  abilityText: "체력을 1 회복합니다.",
  abilityCost: 1,
  abilityEffects: { type: "HEAL_SELF", amount: 1 },
  maxHealth: 30,
  status: "PUBLISHED",
});
await database.insert(schema.championsTable).values({
  id: "rival",
  name: "QA Rival",
  abilityName: "응원",
  abilityText: "체력을 1 회복합니다.",
  abilityCost: 1,
  abilityEffects: { type: "HEAL_SELF", amount: 1 },
  maxHealth: 30,
  status: "PUBLISHED",
});
for (const userId of ["user", "opponent"]) {
  await database
    .insert(schema.userCardCollectionsTable)
    .values(
      cards.map((c) => ({ userId, cardDefinitionId: c.id, quantity: 4 })),
    );
  await database
    .insert(schema.userChampionCollectionsTable)
    .values({ userId, championDefinitionId: "hero", owned: true });
}
const cardIds = [
  "e0",
  "e0",
  "e1",
  "e1",
  "l0",
  "l1",
  "l2",
  ...Array.from({ length: 18 }, (_, i) => `n${Math.floor(i / 3)}`),
];
await database.insert(schema.decksTable).values(
  ["user", "admin", "opponent"].map((userId) => ({
    id: `${userId}-deck`,
    userId,
    name: "EPIC 혼합 덱",
    championDefinitionId: "hero",
    cardDefinitionIds: cardIds,
    isSelected: true,
  })),
);
await database.insert(schema.aiDecksTable).values({
  id: "ai",
  name: "EPIC AI",
  championDefinitionId: "hero",
  cardDefinitionIds: cardIds,
  enabled: true,
});
await database.insert(schema.packDefinitionsTable).values({
  id: "pack",
  name: "EPIC QA Pack",
  normalRate: 0,
  epicRate: 100,
  legendaryRate: 0,
  championRate: 0,
  epicCardPool: ["e0"],
  status: "PUBLISHED",
});
await database
  .insert(schema.userPackInventoryTable)
  .values({ userId: "user", packDefinitionId: "pack", quantity: 5 });
await database.insert(schema.cardsTable).values(
  Array.from({ length: 4 }, (_, i) => ({
    id: `t${i}`,
    name: `Technique ${i}`,
    rarity: i === 0 ? "EPIC" : "NORMAL",
    cardType: "TECHNIQUE",
    cost: 1,
    attack: 0,
    health: 0,
    text: "치유",
    status: "PUBLISHED",
  })),
);
await database.insert(schema.cardsTable).values([
  {
    id: "hidden",
    name: "Hidden",
    rarity: "NORMAL",
    cardType: "WRESTLER",
    cost: 0,
    attack: 99,
    health: 99,
    text: "",
    status: "DRAFT",
  },
  {
    id: "disabled",
    name: "Disabled",
    rarity: "NORMAL",
    cardType: "WRESTLER",
    cost: 0,
    attack: 99,
    health: 99,
    text: "",
    status: "DISABLED",
  },
  {
    id: "token",
    name: "Token",
    rarity: "TOKEN",
    cardType: "WRESTLER",
    cost: 1,
    attack: 1,
    health: 1,
    text: "",
    status: "PUBLISHED",
    isToken: true,
  },
]);
await database.insert(schema.championsTable).values({
  id: "third-hero",
  name: "Third",
  abilityName: "응원",
  abilityText: "체력을 1 회복합니다.",
  abilityCost: 1,
  abilityEffects: { type: "HEAL_SELF", amount: 1 },
  maxHealth: 30,
  status: "PUBLISHED",
});
await database.insert(schema.rewardSettingsTable).values([
  { key: "MATCH_ONLINE_WIN", amount: 20, enabled: true },
  { key: "MATCH_ONLINE_LOSS", amount: 10, enabled: true },
]);
await database.insert(schema.dailyQuestDefinitionsTable).values({
  id: "draft-play",
  title: "Draft QA match",
  description: "",
  objectiveType: "PLAY_MATCH",
  targetValue: 1,
  rewardAmount: 0,
  enabled: true,
});
await database.insert(schema.cardsTable).values({
  id: "support-token",
  name: "Support token",
  rarity: "CHAMPION",
  cardType: "WRESTLER",
  cost: 1,
  attack: 1,
  health: 1,
  text: "",
  status: "DRAFT",
  isChampionToken: true,
});
await database.update(schema.championsTable).set({
  championTokenEnabled: true,
  championTokenDefinitionId: "support-token",
});
const { default: app } = await import("../../../artifacts/api-server/src/app");

const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.on("listening", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const origin = `http://127.0.0.1:${address.port}`;
const cookies = new Map<string, string>();
const matches: string[] = [];
async function request(
  role: string,
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookies.has(role) ? { Cookie: cookies.get(role)! } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const cookie = response.headers.get("set-cookie");
  if (cookie) cookies.set(role, cookie.split(";")[0]);
  return { status: response.status, body: await response.json() };
}
after(async () => {
  const { getRuntime, cleanupMatchRuntime } =
    await import("../../../artifacts/api-server/src/online/service");
  for (const id of matches) {
    const runtime = await getRuntime(id);
    if (runtime) {
      await runtime.queue;
      runtime.state = { ...runtime.state, status: "FINISHED" };
      cleanupMatchRuntime(id);
    }
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pg.close();
  const { pool } = await import("../src/index");
  await pool.end();
});

const { DEFAULT_DRAFT_CONFIG, getLegalActions, chooseBestAction } =
  await import("../../game-engine/src/index");
const { tickDraftSessions } =
  await import("../../../artifacts/api-server/src/lib/draft-service");
const latest = async (role: string, id: string) =>
  (await request(role, `/admin/draft/sessions/${id}`)).body;
async function command(
  role: string,
  v: any,
  type: string,
  pickId?: string,
  key = crypto.randomUUID(),
) {
  return request(role, `/admin/draft/sessions/${v.id}/commands`, "POST", {
    version: v.version,
    requestId: key,
    type,
    pickId,
  });
}
async function stored(id: string) {
  const [r] = await database
    .select()
    .from(schema.draftSessionsTable)
    .where((await import("drizzle-orm")).eq(schema.draftSessionsTable.id, id));
  return r;
}
async function replaceState(id: string, fn: (s: any) => void) {
  const row = await stored(id);
  const s = structuredClone(row.state);
  fn(s);
  await database
    .update(schema.draftSessionsTable)
    .set({ state: s })
    .where((await import("drizzle-orm")).eq(schema.draftSessionsTable.id, id));
}
async function completeDraft(role: string, id: string) {
  let v = await latest(role, id);
  while (v.own.deck.length < 25) {
    const response = v.own.mutationEvent
      ? await command(role, v, "MUTATION_SKIP")
      : await command(role, v, "PICK", v.own.offers[0]);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    v = response.body;
  }
  return v;
}
test("admin-only API and default OFF, pool validation and persistent ON", async () => {
  for (const role of ["admin", "user", "opponent", "third"])
    assert.equal(
      (
        await request(role, "/auth/login", "POST", {
          email: `${role}@epic.invalid`,
          password: "EpicLocalQA123",
        })
      ).status,
      200,
    );
  assert.equal((await request("anon", "/admin/draft")).status, 401);
  assert.equal((await request("user", "/admin/draft")).status, 403);
  assert.equal((await request("admin", "/admin/draft")).body.enabled, false);
  assert.equal(
    (await request("admin", "/admin/draft/sessions", "POST", { mode: "AI" }))
      .status,
    503,
  );
  assert.equal(
    (
      await request("admin", "/admin/draft/settings", "PUT", {
        enabled: true,
        config: {
          ...DEFAULT_DRAFT_CONFIG,
          excludedCardIds: [...cards.map((c) => c.id), "t0", "t1", "t2", "t3"],
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("admin", "/admin/draft/settings", "PUT", { enabled: true }))
      .status,
    200,
  );
  assert.equal(
    (await request("user", "/admin/draft/sessions", "POST", { mode: "AI" }))
      .status,
    403,
  );
  const s = await request("admin", "/admin/draft");
  assert.equal(s.body.enabled, true);
  assert.equal(s.body.poolError, null);
  assert.ok(
    s.body.cards.every(
      (c: any) => !["hidden", "disabled", "token"].includes(c.id),
    ),
  );
});
test("card selection exclusion is admin-only and preserves cards and other draft settings", async () => {
  const { eq } = await import("drizzle-orm");
  const path = "/admin/draft/cards/n0/selection";
  const before = (await database.select().from(schema.cardsTable).where(eq(schema.cardsTable.id, "n0")))[0];
  const settings = (await request("admin", "/admin/draft")).body;
  assert.equal((await request("anon", path, "PATCH", { excluded: true })).status, 401);
  assert.equal((await request("user", "/draft/cards/n0/selection", "PATCH", { excluded: true })).status, 403);
  assert.equal((await request("admin", path, "PATCH", { excluded: "true" })).status, 400);
  assert.equal((await request("admin", "/admin/draft/cards/missing/selection", "PATCH", { excluded: true })).status, 404);
  try {
    const hidden = await request("admin", path, "PATCH", { excluded: true });
    assert.equal(hidden.status, 200);
    assert.ok(hidden.body.excludedCardIds.includes("n0"));
    const changed = (await request("admin", "/admin/draft")).body;
    assert.deepEqual(changed.config, { ...settings.config, excludedCardIds: [...new Set([...settings.config.excludedCardIds, "n0"])] });
    assert.equal(changed.enabled, settings.enabled);
    assert.deepEqual((await database.select().from(schema.cardsTable).where(eq(schema.cardsTable.id, "n0")))[0], before);
    assert.ok((await request("admin", "/admin/draft/card-selection")).body.excludedCardIds.includes("n0"));
  } finally {
    assert.equal((await request("admin", path, "PATCH", { excluded: false })).status, 200);
  }
  assert.deepEqual((await request("admin", "/admin/draft/card-selection")).body.excludedCardIds, settings.config.excludedCardIds);
});

test("no published techniques can enable and finish draft selection with frozen wrestler fallback", async () => {
  const { eq } = await import("drizzle-orm");
  await database
    .update(schema.cardsTable)
    .set({ status: "DRAFT" })
    .where(eq(schema.cardsTable.cardType, "TECHNIQUE"));
  try {
    const settings = await request("admin", "/admin/draft");
    assert.equal(settings.body.poolError, null);
    assert.equal(
      settings.body.poolWarning,
      undefined,
      "sparse-technique fallback stays silent in the player UI",
    );
    assert.deepEqual(settings.body.config.techniquePicks, [5, 10, 15, 20, 25]);
    assert.equal(
      (
        await request("admin", "/admin/draft/settings", "PUT", {
          enabled: true,
        })
      ).status,
      200,
    );
    const started = await request("admin", "/admin/draft/sessions", "POST", {
      mode: "AI",
    });
    assert.equal(started.status, 201, JSON.stringify(started.body));
    assert.deepEqual(started.body.config.techniquePicks, []);
    const v = await completeDraft("admin", started.body.id);
    assert.equal(v.own.deck.length, 25);
    assert.ok(v.own.deck.every((id: string) => !id.startsWith("t")));
    assert.ok(
      (await stored(v.id)).state.seats[1].deck.every(
        (id: string) => !id.startsWith("t"),
      ),
    );
    assert.equal((await command("admin", v, "ABORT")).status, 200);
  } finally {
    await database
      .update(schema.cardsTable)
      .set({ status: "PUBLISHED" })
      .where(eq(schema.cardsTable.cardType, "TECHNIQUE"));
  }
});
test("AI draft persists offers, guards illegal/stale/duplicate commands and does not grant cards", async () => {
  const normalDecks = await database.select().from(schema.decksTable),
    collection = await database.select().from(schema.userCardCollectionsTable);
  let v = (
    await request("admin", "/admin/draft/sessions", "POST", { mode: "AI" })
  ).body;
  assert.equal(v.own.deadline, null);
  assert.equal(v.own.offers.length, 3);
  assert.equal(v.opponent.picks, 25);
  assert.equal(v.opponent.deck, undefined);
  assert.deepEqual((await latest("admin", v.id)).own.offers, v.own.offers);
  assert.equal(
    (await request("admin", "/admin/draft/sessions", "POST", { mode: "AI" }))
      .status,
    409,
  );
  assert.equal((await latest("third", v.id)).code, "FORBIDDEN");
  assert.equal((await command("admin", v, "PICK", "hidden")).status, 400);
  const key = crypto.randomUUID(),
    picked = v.own.offers[0],
    old = v;
  let r = await command("admin", v, "PICK", picked, key);
  assert.equal(r.status, 200);
  v = r.body;
  assert.equal(
    (await command("admin", old, "PICK", picked, key)).body.version,
    v.version,
  );
  assert.equal(
    (await command("admin", old, "PICK", "different", key)).status,
    409,
  );
  assert.equal((await command("admin", old, "PICK", picked)).status, 409);
  const [a, b] = await Promise.all([
    command("admin", v, "PICK", v.own.offers[0]),
    command("admin", v, "PICK", v.own.offers[1]),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  v = await completeDraft("admin", v.id);
  assert.equal(v.own.deck.length, 25);
  assert.equal(v.own.deck.filter((id: string) => id.startsWith("t")).length, 5);
  const state = (await stored(v.id)).state as any;
  assert.equal(state.seats[1].deck.length, 25);
  assert.ok(!state.seats.flatMap((s: any) => s.deck).includes("hidden"));
  const size = (id: string) =>
    v.own.deck.filter((d: string) => d === id).length;
  for (const id of new Set<string>(v.own.deck))
    assert.ok(
      size(id) <=
        (id.startsWith("l") ? 1 : id.startsWith("e") || id === "t0" ? 2 : 3),
    );
  assert.ok(v.own.deck.filter((id: string) => id.startsWith("l")).length <= 3);
  assert.deepEqual(
    await database.select().from(schema.decksTable),
    normalDecks,
  );
  assert.deepEqual(
    await database.select().from(schema.userCardCollectionsTable),
    collection,
  );
  // Snapshots survive catalog edits and reload; restore the QA row afterwards.
  await database
    .update(schema.cardsTable)
    .set({ attack: 88 })
    .where((await import("drizzle-orm")).eq(schema.cardsTable.id, "n0"));
  assert.equal(
    (await latest("admin", v.id)).cards.find((c: any) => c.id === "n0").attack,
    2,
  );
  await database
    .update(schema.cardsTable)
    .set({ attack: 2 })
    .where((await import("drizzle-orm")).eq(schema.cardsTable.id, "n0"));
  r = await command("admin", v, "READY");
  assert.equal(r.status, 200);
  assert.equal(r.body.phase, "BATTLE");
  const resources = await request(
    "admin",
    `/admin/draft/sessions/${v.id}/resources`,
  );
  assert.equal(resources.status, 200);
  assert.ok(Array.isArray(resources.body.media.backgrounds));
  assert.ok(resources.body.cards.some((c: any) => c.id === "support-token"));
  assert.ok(
    !(await latest("admin", v.id)).cards.some(
      (c: any) => c.id === "support-token",
    ),
  );
  assert.ok(
    ((await stored(v.id)).state as any).battle.cardPool.some(
      (c: any) => c.id === "support-token",
    ),
  );
  const battle = await request("admin", `/admin/draft/sessions/${v.id}/battle`);
  assert.equal(battle.status, 200);
  assert.equal(battle.body.state.players[1].hand.hidden, true);
  assert.ok(Array.isArray(battle.body.state.players[0].deck));
  assert.equal(
    (await request("user", `/admin/draft/sessions/${v.id}/battle`)).status,
    403,
  );
  await replaceState(v.id, (s) => {
    s.gameplayStartsAt = Date.now() - 1;
  });
  let m = (await request("admin", `/admin/draft/sessions/${v.id}/battle`)).body;
  r = await request("admin", `/admin/draft/sessions/${v.id}/actions`, "POST", {
    requestId: crypto.randomUUID(),
    expectedVersion: m.version,
    action: { type: "MULLIGAN", cardInstanceIds: [] },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  m = r.body;
  const surrenderKey = crypto.randomUUID();
  r = await request("admin", `/admin/draft/sessions/${v.id}/actions`, "POST", {
    requestId: surrenderKey,
    expectedVersion: m.version,
    action: { type: "SURRENDER" },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.state.status, "FINISHED");
  assert.equal(
    (
      await request("admin", `/admin/draft/sessions/${v.id}/actions`, "POST", {
        requestId: surrenderKey,
        expectedVersion: m.version,
        action: { type: "SURRENDER" },
      })
    ).status,
    200,
  );
  const reward = await request(
    "admin",
    `/admin/draft/sessions/${v.id}/rewards`,
  );
  assert.equal(reward.body.grants.length, 1);
  assert.equal(reward.body.grants[0].amount, 10);
  assert.equal((await request("admin", "/admin/draft")).body.currentId, null);
  const final = await latest("admin", v.id);
  assert.ok(final.opponent.deck.length === 25);
  assert.equal(final.result.won, false);
  const assignments = await database
    .select()
    .from(schema.dailyQuestAssignmentsTable);
  assert.ok(
    assignments.some(
      (a) =>
        a.userId === "admin" &&
        a.definitionId === "draft-play" &&
        a.progress === 1,
    ),
  );
});
test("PvP joins before selection, hides opponent picks, timers and worker recover after disconnect", async () => {
  let v = (
    await request("admin", "/admin/draft/sessions", "POST", { mode: "PVP" })
  ).body;
  assert.equal(v.phase, "WAITING");
  assert.equal(v.own.offers.length, 0);
  const invitation = (
    await request("opponent", `/admin/draft/sessions/${v.id}/invitation`)
  ).body;
  const joined = await command("opponent", invitation, "JOIN");
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  assert.equal(joined.body.phase, "DRAFT");
  assert.equal(joined.body.own.offers.length, 3);
  assert.equal(
    (
      await request("third", `/admin/draft/sessions/${v.id}/commands`, "POST", {
        type: "JOIN",
        version: invitation.version,
        requestId: crypto.randomUUID(),
      })
    ).status,
    403,
  );
  let own = await latest("admin", v.id);
  assert.ok(own.own.deadline - own.serverTime <= 45000);
  assert.equal(own.opponent.championId, undefined);
  assert.equal(
    (await request("user", `/admin/draft/sessions/${v.id}`)).status,
    403,
  );
  await replaceState(v.id, (s) => {
    for (const seat of s.seats) seat.deadline = Date.now() - 800000;
  });
  await tickDraftSessions();
  own = await latest("admin", v.id);
  assert.equal(own.phase, "BATTLE");
  assert.equal(own.own.deck.length, 25);
  assert.equal(own.own.history.length, 26);
  assert.ok(own.own.history.every((p: any) => p.automatic));
  const ownerBattle = (
    await request("admin", `/admin/draft/sessions/${v.id}/battle`)
  ).body;
  const enemyBattle = (
    await request("opponent", `/admin/draft/sessions/${v.id}/battle`)
  ).body;
  assert.equal(enemyBattle.seat, "PLAYER_TWO");
  assert.equal(ownerBattle.state.players[1].deck.hidden, true);
  // No opponent can execute the other seat's turn, including API bypass.
  await replaceState(v.id, (s) => {
    s.gameplayStartsAt = Date.now() - 1;
  });
  let r = await request(
    "admin",
    `/admin/draft/sessions/${v.id}/actions`,
    "POST",
    {
      requestId: crypto.randomUUID(),
      expectedVersion: (await latest("admin", v.id)).version,
      action: { type: "MULLIGAN", cardInstanceIds: [] },
    },
  );
  assert.equal(r.status, 200);
  r = await request(
    "opponent",
    `/admin/draft/sessions/${v.id}/actions`,
    "POST",
    {
      requestId: crypto.randomUUID(),
      expectedVersion: (await latest("opponent", v.id)).version,
      action: { type: "MULLIGAN", cardInstanceIds: [] },
    },
  );
  assert.equal(r.status, 200);
  const row = (await stored(v.id)).state as any;
  const wrong =
    row.battle.activePlayerId === "PLAYER_ONE" ? "opponent" : "admin";
  r = await request(wrong, `/admin/draft/sessions/${v.id}/actions`, "POST", {
    requestId: crypto.randomUUID(),
    expectedVersion: (await latest(wrong, v.id)).version,
    action: { type: "END_TURN" },
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "NOT_YOUR_TURN");
  await replaceState(v.id, (s) => {
    s.lastSeen[1] = Date.now() - 61000;
    s.lastSeen[0] = Date.now();
  });
  await tickDraftSessions();
  assert.equal((await latest("admin", v.id)).phase, "FINISHED");
  assert.equal(
    (await request("admin", `/admin/draft/sessions/${v.id}/rewards`)).body
      .grants[0].amount,
    20,
  );
  assert.equal(
    (await request("opponent", `/admin/draft/sessions/${v.id}/rewards`)).body
      .grants[0].amount,
    10,
  );
});
test("OFF persists existing drafts and prevents operations; re-enable restores identical offers", async () => {
  let v = (
    await request("admin", "/admin/draft/sessions", "POST", { mode: "AI" })
  ).body;
  const offers = v.own.offers;
  assert.equal(
    (await request("admin", "/admin/draft/settings", "PUT", { enabled: false }))
      .status,
    200,
  );
  assert.equal(
    (await request("admin", `/admin/draft/sessions/${v.id}`)).status,
    503,
  );
  await tickDraftSessions();
  assert.equal((await stored(v.id)).version, v.version);
  assert.equal(
    (await request("admin", "/admin/draft/settings", "PUT", { enabled: true }))
      .status,
    200,
  );
  v = await latest("admin", v.id);
  assert.deepEqual(v.own.offers, offers);
  assert.equal((await command("admin", v, "ABORT")).body.phase, "ABORTED");
  assert.equal(
    (await request("admin", `/admin/draft/sessions/${v.id}/rewards`)).body
      .grants.length,
    0,
  );
});

test("five full AI draft matches execute legal actions through HTTP and reach terminal rewards", async () => {
  for (let run = 0; run < 5; run++) {
    const created = await request("third", "/admin/draft/sessions", "POST", {
      mode: "AI",
    });
    assert.equal(created.status, 201);
    let v = created.body;
    v = await completeDraft("third", v.id);
    assert.equal((await command("third", v, "READY")).body.phase, "BATTLE");
    await replaceState(v.id, (s) => {
      s.gameplayStartsAt = Date.now() - 1;
    });
    let battle = (
      await request("third", `/admin/draft/sessions/${v.id}/battle`)
    ).body;
    let r = await request(
      "third",
      `/admin/draft/sessions/${v.id}/actions`,
      "POST",
      {
        requestId: crypto.randomUUID(),
        expectedVersion: battle.version,
        action: { type: "MULLIGAN", cardInstanceIds: [] },
      },
    );
    assert.equal(r.status, 200, JSON.stringify(r.body));
    let decisions = 0;
    for (; decisions < 500; decisions++) {
      const row = await stored(v.id);
      const state = (row.state as any).battle;
      if (state.status === "FINISHED") break;
      assert.equal(state.activePlayerId, "PLAYER_ONE");
      const legal = getLegalActions(state, "PLAYER_ONE");
      assert.ok(legal.length > 0);
      const action = chooseBestAction(state, legal, "PLAYER_ONE");
      const { playerId, ...payload } = action;
      r = await request(
        "third",
        `/admin/draft/sessions/${v.id}/actions`,
        "POST",
        {
          requestId: crypto.randomUUID(),
          expectedVersion: row.version,
          action: payload,
        },
      );
      assert.equal(r.status, 200, JSON.stringify(r.body));
    }
    assert.ok(decisions < 500, "combat must finish without deadlock");
    assert.ok(r.body.recap.mvp);
    assert.ok(r.body.recap.highlights.length <= 3);
    const finalPayload = await request(
      "third",
      `/admin/draft/sessions/${v.id}/battle`,
    );
    assert.deepEqual(finalPayload.body.recap, r.body.recap);
    assert.equal((await latest("third", v.id)).phase, "FINISHED");
    const reward = await request(
      "third",
      `/admin/draft/sessions/${v.id}/rewards`,
    );
    assert.equal(reward.body.grants.length, 1);
  }
});

test("additive draft migration is repeatable and preserves ON settings, sessions and original decks", async () => {
  const sqlText = await readFile(
    new URL("../migrations/0037_admin_draft.sql", import.meta.url),
    "utf8",
  );
  const sessions = await database.select().from(schema.draftSessionsTable),
    decks = await database.select().from(schema.decksTable);
  await pg.exec(sqlText);
  await pg.exec(sqlText);
  assert.equal((await request("admin", "/admin/draft")).body.enabled, true);
  assert.deepEqual(
    await database.select().from(schema.draftSessionsTable),
    sessions,
  );
  assert.deepEqual(await database.select().from(schema.decksTable), decks);
});

test("Draft 2.0 HTTP saves reroll/lock/special/mutation and transfers exact copies to authoritative battle", async () => {
  const beforeCards = await database.select().from(schema.cardsTable);
  let v = (
    await request("admin", "/admin/draft/sessions", "POST", { mode: "AI" })
  ).body;
  v = (await command("admin", v, "PICK", v.own.offers[0])).body;
  const locked = v.own.offers[1];
  v = (await command("admin", v, "LOCK", locked)).body;
  const stale = v;
  const key = crypto.randomUUID();
  let r = await command("admin", v, "REROLL", undefined, key);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  v = r.body;
  assert.equal(v.own.rerollsUsed, 1);
  assert.ok(v.own.offers.includes(locked));
  assert.equal(
    (await command("admin", stale, "REROLL", undefined, key)).body.own
      .rerollsUsed,
    1,
  );
  let reloaded = await latest("admin", v.id);
  assert.deepEqual(reloaded.own, v.own);
  v = (await command("admin", v, "REROLL")).body;
  assert.equal(v.own.rerollsUsed, 2);
  assert.equal((await command("admin", v, "REROLL")).status, 400);
  while (v.own.deck.length < 5) {
    if (v.own.deck.length === 4) assert.ok(v.own.specialPick);
    r = await command("admin", v, "PICK", v.own.offers[0]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    v = r.body;
  }
  assert.ok(v.own.mutationEvent);
  assert.equal(v.own.cards.length, 5);
  assert.equal(
    (await command("admin", v, "PICK", v.own.offers[0])).status,
    400,
  );
  const target = v.own.cards.find(
    (c: any) =>
      v.cards.find((d: any) => d.id === c.definitionId)?.cardType !==
      "TECHNIQUE",
  );
  v = (await command("admin", v, "MUTATION_TARGET", target.instanceId)).body;
  assert.equal(v.own.mutationEvent.offers.length, 3);
  reloaded = await latest("admin", v.id);
  assert.deepEqual(reloaded.own.mutationEvent, v.own.mutationEvent);
  assert.equal(
    (await command("admin", v, "MUTATION_TARGET", v.own.cards[1].instanceId))
      .status,
    400,
  );
  v = (
    await command("admin", v, "MUTATION_PICK", v.own.mutationEvent.offers[0])
  ).body;
  const mutated = v.own.cards.find(
    (c: any) => c.instanceId === target.instanceId,
  );
  assert.ok(mutated.mutation);
  assert.equal((await latest("admin", v.id)).own.rerollsUsed, 2);
  v = await completeDraft("admin", v.id);
  assert.equal(v.own.mutationEvent, null);
  v = (await command("admin", v, "READY")).body;
  assert.equal(v.phase, "BATTLE");
  const state = (await stored(v.id)).state as any;
  const copies = [
    ...state.battle.players[0].hand,
    ...state.battle.players[0].deck,
  ];
  const actual = copies.find((c: any) => c.instanceId === target.instanceId);
  assert.ok(actual);
  assert.deepEqual(actual.draftMutation, mutated.mutation);
  const def = beforeCards.find((c) => c.id === target.definitionId)!;
  assert.equal(
    actual.currentCost,
    Math.max(0, def.cost + mutated.mutation.cost),
  );
  assert.equal(actual.currentAttack, def.attack + mutated.mutation.attack);
  assert.equal(actual.maxHealth, def.health + mutated.mutation.health);
  assert.deepEqual(
    await database.select().from(schema.cardsTable),
    beforeCards,
  );
  await command("admin", await latest("admin", v.id), "ABORT");
});

test("both PvP participants mutate separate copies and reconnect to the same authoritative battle", async () => {
  const first = (
    await request("admin", "/admin/draft/sessions", "POST", { mode: "PVP" })
  ).body;
  const invite = (
    await request("opponent", `/admin/draft/sessions/${first.id}/invitation`)
  ).body;
  assert.equal((await command("opponent", invite, "JOIN")).status, 200);
  const copies: { role: string; id: string; mutation: any }[] = [];
  for (const role of ["admin", "opponent"]) {
    let v = await latest(role, first.id);
    while (v.own.deck.length < 5) {
      const r = await command(role, v, "PICK", v.own.offers[0]);
      assert.equal(r.status, 200, JSON.stringify(r.body));
      v = r.body;
    }
    const copy = v.own.cards.find(
      (c: any) =>
        v.cards.find((d: any) => d.id === c.definitionId)?.cardType !==
        "TECHNIQUE",
    );
    v = (await command(role, v, "MUTATION_TARGET", copy.instanceId)).body;
    v = (await command(role, v, "MUTATION_PICK", v.own.mutationEvent.offers[0]))
      .body;
    copies.push({
      role,
      id: copy.instanceId,
      mutation: v.own.cards.find((c: any) => c.instanceId === copy.instanceId)
        .mutation,
    });
    const other = await latest(
      role === "admin" ? "opponent" : "admin",
      first.id,
    );
    assert.equal(other.opponent.cards, undefined);
    assert.equal(other.opponent.mutationEvent, undefined);
    v = await completeDraft(role, first.id);
    assert.equal((await command(role, v, "READY")).status, 200);
  }
  const state = (await stored(first.id)).state as any;
  assert.equal(state.phase, "BATTLE");
  for (const [seat, copy] of copies.entries()) {
    const cards = [
      ...state.battle.players[seat].hand,
      ...state.battle.players[seat].deck,
    ];
    assert.deepEqual(
      cards.find((c: any) => c.instanceId === copy.id)?.draftMutation,
      copy.mutation,
    );
    const resumed = (
      await request(copy.role, `/admin/draft/sessions/${first.id}/battle`)
    ).body;
    const own = resumed.state.players[seat];
    assert.ok(
      [...own.hand, ...own.deck].some((c: any) => c.instanceId === copy.id),
    );
    const hidden = resumed.state.players[1 - seat];
    assert.equal(hidden.hand.hidden, true);
    assert.equal(hidden.deck.hidden, true);
  }
  const version = (await latest("admin", first.id)).version;
  const response = await request(
    "admin",
    `/admin/draft/sessions/${first.id}/battle`,
  );
  assert.equal(
    response.body.version,
    version,
    "heartbeat must not create a false gameplay version",
  );
  await command("admin", await latest("admin", first.id), "ABORT");
});
