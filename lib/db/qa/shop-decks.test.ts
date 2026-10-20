/** Isolated PostgreSQL-compatible integration fixture. Never connects to production. */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import * as schema from "../src/schema";
import { eq, sql } from "drizzle-orm";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.NODE_ENV = "development";
const useNative = process.env.KO_SHOP_DECKS_NATIVE === "1";
const nativeName = "shop_decks_qa_" + process.pid;
const { Pool } = await import("pg");
const nativeAdmin = useNative
  ? new Pool({
      connectionString: "postgresql://agent@127.0.0.1:55432/ko_cosmetics_qa",
    })
  : null;
if (nativeAdmin) await nativeAdmin.query("CREATE DATABASE " + nativeName);
const native = useNative
  ? new Pool({
      connectionString: "postgresql://agent@127.0.0.1:55432/" + nativeName,
    })
  : null;
const { drizzle: drizzlePg } = await import("drizzle-orm/node-postgres");
const pg: any = native
  ? {
      exec: (q: string) => native.query(q),
      close: async () => {
        await native.end();
        await nativeAdmin!.query("DROP DATABASE " + nativeName);
        await nativeAdmin!.end();
      },
    }
  : new PGlite();
const database: any = native
  ? drizzlePg(native, { schema })
  : drizzle(pg, { schema });
for (const ddl of await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson(schema),
))
  await pg.exec(ddl);
const migration = await readFile(
  new URL("../migrations/0054_shop_decks.sql", import.meta.url),
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
const require = createRequire(
  new URL("../../../artifacts/api-server/package.json", import.meta.url),
);
const express = require("express");
const root = express();
const assets = new Map<string, Buffer>();
const server = root.listen(
  process.env.KO_SHOP_DECKS_BROWSER_MODE === "1"
    ? Number(process.env.KO_SHOP_DECKS_FIXTURE_PORT ?? 5188)
    : 0,
  "127.0.0.1",
);
await new Promise<void>((r) => server.once("listening", r));
const connections = new Set<import("node:net").Socket>();
server.on("connection", (socket: import("node:net").Socket) => {
  connections.add(socket);
  socket.on("close", () => connections.delete(socket));
});
const origin = "http://127.0.0.1:" + server.address().port;
process.env.STORAGE_PROVIDER = "supabase";
process.env.SUPABASE_URL = origin;
process.env.SUPABASE_SECRET_KEY = "local-fixture-only";
process.env.SUPABASE_STORAGE_BUCKET = "qa";
// Real Supabase adapter over a local HTTP object-store fixture, not a production bucket.
root.use("/storage", (req: any, res: any, next: any) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "content-type,authorization,x-client-info,apikey",
  );
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
root.post("/storage/v1/object/upload/sign/*key", (_req: any, res: any) =>
  res.json({
    url:
      "/object/upload/sign/" +
      _req.params.key.join("/") +
      "?token=local-fixture",
  }),
);
root.put(
  "/storage/v1/object/upload/sign/*key",
  express.raw({ type: "*/*", limit: "6mb" }),
  (req: any, res: any) => {
    assets.set(req.params.key.join("/").replace(/^qa\//, ""), req.body);
    res.json({ Key: req.params.key.join("/") });
  },
);
root.get(
  ["/storage/v1/object/authenticated/*key", "/storage/v1/object/*key"],
  (req: any, res: any) => {
    const bytes = assets.get(req.params.key.join("/").replace(/^qa\//, ""));
    if (!bytes) return res.status(404).json({ message: "Object not found" });
    res.type("png").send(bytes);
  },
);
const { default: app } = await import("../../../artifacts/api-server/src/app");
root.use(app);
root.use((error: any, _req: any, res: any, _next: any) => {
  console.error("QA DATABASE ERROR", error.cause ?? error);
  res
    .status(500)
    .json({ message: String(error.cause?.message ?? error.message) });
});
const { attachOnlineMatchWebSocket } =
  await import("../../../artifacts/api-server/src/online/websocket");
attachOnlineMatchWebSocket(server);
const { hashPassword } =
  await import("../../../artifacts/api-server/src/lib/auth");
const { getRuntime, cleanupMatchRuntime, applyMatchAction } =
  await import("../../../artifacts/api-server/src/online/service");
const password = "Local-only-deck-QA-123!",
  hash = await hashPassword(password);
const cookies: Record<string, string> = {};
async function addUser(id: string, balance = 1000, champion = true) {
  await database.insert(schema.usersTable).values({
    id,
    email: id + "@shop-decks.invalid",
    nickname: id,
    passwordHash: hash,
    role: id === "admin" ? "ADMIN" : "USER",
    currencyBalance: balance,
    shopCurrencyStarterGrantedAt: new Date(),
  });
  const token = "shop-decks-local-" + id;
  cookies[id] = "ko_session=" + token;
  await database.insert(schema.sessionsTable).values({
    id: "session-" + id,
    userId: id,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 86400000),
  });
  if (champion)
    await database
      .insert(schema.userChampionCollectionsTable)
      .values({ userId: id, championDefinitionId: "deck-hero", owned: true });
}
const sharp = require("sharp");
const png = await sharp({
  create: { width: 320, height: 220, channels: 4, background: "#775439" },
})
  .png()
  .toBuffer();
root.get("/api/qa-decks/art.png", (_req: any, res: any) =>
  res.type("png").send(png),
);
const cards = Array.from({ length: 12 }, (_, i) => ({
  id: "deck-unit-" + i,
  name: "상점 검증 선수 " + i,
  cardType: i === 9 ? "TECHNIQUE" : "WRESTLER",
  cost: i % 6,
  attack: 2,
  health: 4,
  text: "",
  rarity: i >= 9 ? "LEGENDARY" : i === 8 ? "EPIC" : "NORMAL",
  status: "PUBLISHED",
  imageUrl: origin + "/api/qa-decks/art.png",
}));
await database.insert(schema.cardsTable).values(cards);
await database.insert(schema.cardsTable).values([
  {
    id: "deck-token",
    name: "금지 토큰",
    cardType: "WRESTLER",
    cost: 0,
    attack: 1,
    health: 1,
    text: "",
    isToken: true,
    status: "PUBLISHED",
  },
  {
    id: "deck-hidden",
    name: "미공개 선수",
    cardType: "WRESTLER",
    cost: 1,
    attack: 1,
    health: 1,
    text: "",
    status: "DRAFT",
  },
  {
    id: "deck-legend4",
    name: "네번째 레전더리",
    cardType: "WRESTLER",
    cost: 1,
    attack: 1,
    health: 1,
    text: "",
    rarity: "LEGENDARY",
    status: "PUBLISHED",
  },
]);
await database.insert(schema.championsTable).values(
  ["deck-hero", "included-hero"].map((id) => ({
    id,
    name: id === "deck-hero" ? "보유 챔피언" : "상품 포함 챔피언",
    status: "PUBLISHED",
    abilityName: "휴식",
    abilityText: "효과 없음",
    abilityCost: 0,
    abilityEffects: {},
    imageUrl: origin + "/api/qa-decks/art.png",
  })),
);
const deck = cards
  .slice(0, 8)
  .flatMap((c) => Array(3).fill(c.id))
  .concat(cards[8]!.id);
await database.insert(schema.aiDecksTable).values({
  id: "deck-ai",
  name: "완성 덱 검증 AI",
  enabled: true,
  championDefinitionId: "deck-hero",
  cardDefinitionIds: deck,
});
for (const id of [
  "admin",
  "buyer",
  "poor",
  "partial",
  "concurrent",
  "rollback",
  "no-champion",
  "included",
  "price-change",
  "card-change",
  "browser-buyer",
  "browser-opponent",
  "opponent",
])
  await addUser(id, id === "poor" ? 10 : 1000, id !== "no-champion");
async function api(
  path: string,
  user = "admin",
  method = "GET",
  body?: unknown,
) {
  const res = await fetch(origin + "/api" + path, {
    method,
    headers: {
      cookie: cookies[user] ?? "",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
let imageUrl: string | null = null,
  product: any,
  purchasedDeckId = "",
  runtime: any;
const input = () => ({
  name: "실전 완성 덱",
  description: "일반 덱 규칙을 지킨 25장 상품",
  imageUrl,
  cardDefinitionIds: deck,
  price: 300,
  recommendedChampionId: "included-hero",
  includeChampion: false,
  allowUnpublished: false,
  enabled: true,
  displayOrder: 1,
});
async function create(overrides: Record<string, unknown> = {}) {
  const r = await api("/admin/shop-decks", "admin", "POST", {
    ...input(),
    ...overrides,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.item;
}
async function rows(table: any) {
  return database.select().from(table);
}
async function balance(id: string) {
  const [r] = await database
    .select()
    .from(schema.usersTable)
    .where(eq(schema.usersTable.id, id));
  return r.currencyBalance;
}
async function buy(user: string, id = product.id, body: any = {}) {
  return api("/shop/decks/" + id + "/purchase", user, "POST", body);
}

test("administrator and player authentication is enforced including differently cased routes", async () => {
  assert.equal((await api("/shop/decks", "anonymous")).status, 401);
  for (const path of ["/admin/shop-decks", "/ADMIN/SHOP-DECKS"])
    assert.equal((await api(path, "buyer")).status, 403);
  assert.equal((await api("/admin/shop-decks", "admin")).status, 200);
  assert.equal(
    (await api("/admin/shop-decks", "buyer", "POST", input())).status,
    403,
  );
});
test("actual signed image upload validates format, bytes and persists reusable representative asset", async () => {
  assert.equal(
    (
      await api("/admin/shop-decks/uploads", "admin", "POST", {
        name: "x.svg",
        size: 10,
        contentType: "image/svg+xml",
      })
    ).status,
    400,
  );
  const signed = await api("/admin/shop-decks/uploads", "admin", "POST", {
    name: "deck.png",
    size: png.length,
    contentType: "image/png",
  });
  assert.equal(signed.status, 200);
  assert.equal(
    (
      await fetch(signed.body.uploadURL, {
        method: "PUT",
        body: png,
        headers: { "Content-Type": "image/png" },
      })
    ).status,
    200,
  );
  const complete = await api(
    "/admin/shop-decks/uploads/complete",
    "admin",
    "POST",
    { objectPath: signed.body.objectPath, contentType: "image/png" },
  );
  assert.equal(complete.status, 200);
  imageUrl = complete.body.imageUrl;
  const invalid = await api("/admin/shop-decks/uploads", "admin", "POST", {
    name: "bad.png",
    size: 4,
    contentType: "image/png",
  });
  await fetch(invalid.body.uploadURL, { method: "PUT", body: "fake" });
  assert.equal(
    (
      await api("/admin/shop-decks", "admin", "POST", {
        ...input(),
        imageUrl: "/api/storage" + invalid.body.objectPath,
      })
    ).status,
    400,
  );
});
test("valid 25-card product references existing definitions, survives reload, supports editing and ordering", async () => {
  product = await create();
  const count = (await rows(schema.cardsTable)).length;
  const changed = await api(
    "/admin/shop-decks/" + product.id,
    "admin",
    "PATCH",
    { ...product, description: "등록 후 설명 수정", displayOrder: -1 },
  );
  assert.equal(changed.status, 200);
  product = changed.body.item;
  const store = await api("/shop/decks", "buyer");
  assert.equal(store.status, 200);
  assert.equal(store.body.items[0].id, product.id);
  assert.equal(store.body.items[0].cards.length, 9);
  assert.equal(
    store.body.items[0].recommendedChampion.name,
    "상품 포함 챔피언",
  );
  assert.equal(store.body.items[0].includeChampion, false);
  assert.equal((await rows(schema.cardsTable)).length, count);
});
test("invalid size, duplicates, rarity limits, tokens, unknown IDs and unpublished defaults are rejected", async () => {
  const variants = [
    deck.slice(1),
    [...deck, cards[8]!.id],
    [...Array(4).fill(cards[0]!.id), ...deck.slice(4)],
    deck.map((id, i) => (i < 3 ? cards[8]!.id : id)),
    deck.map((id, i) => (i === 0 ? "deck-token" : id)),
    deck.map((id, i) => (i === 0 ? "missing" : id)),
    deck.map((id, i) => (i === 0 ? "deck-hidden" : id)),
    deck.map((id, i) => (i < 2 ? cards[9]!.id : id)),
    deck.map((id, i) =>
      i < 4
        ? [cards[9]!.id, cards[10]!.id, cards[11]!.id, "deck-legend4"][i]
        : id,
    ),
  ];
  for (const ids of variants) {
    const r = await api("/admin/shop-decks", "admin", "POST", {
      ...input(),
      cardDefinitionIds: ids,
    });
    assert.ok(r.status === 400 || r.status === 422, JSON.stringify(r));
  }
  for (const price of [-1, 1.5, 2147483648, "300"])
    assert.equal(
      (await api("/admin/shop-decks", "admin", "POST", { ...input(), price }))
        .status,
      400,
    );
});
test("unpublished sales require explicit administrator setting, champion inclusion requires a real target", async () => {
  const hidden = await create({
    name: "명시적 미공개 상품",
    allowUnpublished: true,
    cardDefinitionIds: deck.map((id, i) => (i === 0 ? "deck-hidden" : id)),
  });
  assert.equal(
    (await api("/shop/decks", "buyer")).body.items
      .find((p: any) => p.id === hidden.id)
      .cards.some((c: any) => c.id === "deck-hidden"),
    true,
  );
  assert.equal(
    (
      await api("/admin/shop-decks", "admin", "POST", {
        ...input(),
        includeChampion: true,
        recommendedChampionId: null,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api("/admin/shop-decks", "admin", "POST", {
        ...input(),
        recommendedChampionId: "missing",
      })
    ).status,
    422,
  );
});
test("purchase atomically deducts authoritative price, grants exact card shortages, saves an editable playable deck and receipt", async () => {
  const r = await buy("buyer", product.id, {
    price: 1,
    cardDefinitionIds: ["forged"],
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.currencyBalance, 700);
  assert.equal(await balance("buyer"), 700);
  purchasedDeckId = r.body.deckId;
  const collected = (await rows(schema.userCardCollectionsTable)).filter(
    (c: any) => c.userId === "buyer",
  );
  assert.equal(
    collected.reduce((n: number, c: any) => n + c.quantity, 0),
    25,
  );
  const decks = await api("/decks", "buyer"),
    saved = decks.body.decks.find((d: any) => d.id === purchasedDeckId);
  assert.equal(saved.isValid, true, JSON.stringify(saved.invalidReasons));
  assert.deepEqual(saved.cardDefinitionIds, deck);
  assert.equal(saved.championDefinitionId, "deck-hero");
  assert.equal(saved.name, product.name);
  assert.equal(
    (await rows(schema.userChampionCollectionsTable)).some(
      (c: any) =>
        c.userId === "buyer" && c.championDefinitionId === "included-hero",
    ),
    false,
  );
  const edit = await api("/decks/" + purchasedDeckId, "buyer", "PATCH", {
    name: "구매 후 자유 편집",
    championDefinitionId: "deck-hero",
    cardDefinitionIds: [...deck].reverse(),
  });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.deck.name, "구매 후 자유 편집");
  assert.equal(edit.body.deck.isValid, true);
  assert.equal(
    (await api("/decks/" + purchasedDeckId + "/select", "buyer", "POST"))
      .status,
    200,
  );
  assert.equal(
    (await rows(schema.currencyTransactionsTable)).filter(
      (r: any) => r.userId === "buyer" && r.type === "SHOP_DECK_PURCHASE",
    ).length,
    1,
  );
});
test("partially owned and sufficient copies are topped up without deleting or multiplying existing cards", async () => {
  await database.insert(schema.userCardCollectionsTable).values([
    { userId: "partial", cardDefinitionId: cards[0]!.id, quantity: 1 },
    { userId: "partial", cardDefinitionId: cards[1]!.id, quantity: 9 },
    { userId: "partial", cardDefinitionId: cards[11]!.id, quantity: 1 },
  ]);
  const r = await buy("partial");
  assert.equal(r.status, 200);
  assert.equal(r.body.purchase.receipt.grantedCards[cards[0]!.id], 2);
  assert.equal(r.body.purchase.receipt.grantedCards[cards[1]!.id], 0);
  const rows1 = (await rows(schema.userCardCollectionsTable)).filter(
    (c: any) => c.userId === "partial",
  );
  assert.equal(
    rows1.find((c: any) => c.cardDefinitionId === cards[1]!.id).quantity,
    9,
  );
  assert.equal(
    rows1.find((c: any) => c.cardDefinitionId === cards[11]!.id).quantity,
    1,
  );
  assert.equal(await balance("partial"), 700);
});
test("insufficient balance and unowned champion selections fail with no partial grant or receipt", async () => {
  assert.equal((await buy("poor")).status, 422);
  assert.equal(await balance("poor"), 10);
  assert.equal((await buy("no-champion")).status, 422);
  assert.equal(await balance("no-champion"), 1000);
  assert.equal(
    (
      await buy("price-change", product.id, {
        championDefinitionId: "included-hero",
      })
    ).status,
    422,
  );
  for (const id of ["poor", "no-champion", "price-change"])
    assert.equal(
      (await rows(schema.shopDeckPurchasesTable)).filter(
        (p: any) => p.userId === id,
      ).length,
      0,
    );
});
test("champion-inclusive product explicitly grants its champion and creates a usable deck", async () => {
  const incl = await create({ name: "챔피언 포함 덱", includeChampion: true });
  const r = await buy("included", incl.id);
  assert.equal(r.status, 200);
  assert.equal(r.body.purchase.receipt.includedChampionId, "included-hero");
  const d = (await api("/decks", "included")).body.decks.find(
    (d: any) => d.id === r.body.deckId,
  );
  assert.equal(d.championDefinitionId, "included-hero");
  assert.equal(d.isValid, true);
});
test("concurrent requests and later retries charge once and preserve one durable ownership receipt", async () => {
  const results = await Promise.all(
    Array.from({ length: 6 }, () => buy("concurrent")),
  );
  assert.ok(
    results.every((r) => r.status === 200),
    JSON.stringify(results),
  );
  assert.equal(new Set(results.map((r) => r.body.deckId)).size, 1);
  assert.equal(results.filter((r) => !r.body.alreadyPurchased).length, 1);
  assert.equal(await balance("concurrent"), 700);
  assert.equal(
    (await rows(schema.shopDeckPurchasesTable)).filter(
      (r: any) => r.userId === "concurrent",
    ).length,
    1,
  );
  assert.equal(
    (await rows(schema.decksTable)).filter(
      (r: any) => r.userId === "concurrent",
    ).length,
    1,
  );
  const retry = await buy("concurrent");
  assert.equal(retry.body.alreadyPurchased, true);
  assert.equal(await balance("concurrent"), 700);
});
test("database failure after grant and deck creation rolls back currency, cards, champion, deck and receipt together", async () => {
  const incl = await create({ name: "오류 롤백 검증", includeChampion: true });
  await pg.exec(
    "ALTER TABLE currency_transactions ADD CONSTRAINT qa_refuse_deck_sale CHECK(type <> 'SHOP_DECK_PURCHASE') NOT VALID",
  );
  try {
    assert.equal((await buy("rollback", incl.id)).status, 500);
  } finally {
    await pg.exec(
      "ALTER TABLE currency_transactions DROP CONSTRAINT qa_refuse_deck_sale",
    );
  }
  assert.equal(await balance("rollback"), 1000);
  for (const table of [
    schema.decksTable,
    schema.userCardCollectionsTable,
    schema.shopDeckPurchasesTable,
  ])
    assert.equal(
      (await rows(table)).filter((r: any) => r.userId === "rollback").length,
      0,
    );
  assert.equal(
    (await rows(schema.userChampionCollectionsTable)).some(
      (r: any) =>
        r.userId === "rollback" && r.championDefinitionId === "included-hero",
    ),
    false,
  );
  assert.equal((await buy("rollback", incl.id)).status, 200);
});
test("current price is used, disabled catalog blocks new purchases but existing retry remains idempotent", async () => {
  const p = await create({ name: "가격 변경 검증" });
  await api("/admin/shop-decks/" + p.id, "admin", "PATCH", {
    ...p,
    price: 450,
  });
  const r = await buy("price-change", p.id, { price: 300 });
  assert.equal(r.body.currencyBalance, 550);
  assert.equal(r.body.purchase.price, 450);
  await api("/admin/shop-decks/" + p.id + "/disable", "admin", "POST");
  assert.equal((await buy("poor", p.id)).status, 409);
  assert.equal((await buy("price-change", p.id)).body.alreadyPurchased, true);
  assert.equal(await balance("price-change"), 550);
});
test("changed or deleted live definitions invalidate a sale; disable works even with broken references", async () => {
  const p = await create({
    name: "라이브 재검증",
    cardDefinitionIds: deck.map((id, i) => (i === 0 ? "deck-hidden" : id)),
    allowUnpublished: true,
  });
  await database
    .update(schema.cardsTable)
    .set({ status: "DISABLED" })
    .where(eq(schema.cardsTable.id, "deck-hidden"));
  assert.equal((await buy("card-change", p.id)).status, 422);
  assert.equal(await balance("card-change"), 1000);
  assert.ok(
    (await api("/shop/decks", "buyer")).body.items.find(
      (item: any) => item.id === p.id,
    ).unavailable,
  );
  await database
    .delete(schema.cardsTable)
    .where(eq(schema.cardsTable.id, "deck-hidden"));
  assert.equal(
    (await api("/admin/shop-decks/" + p.id + "/disable", "admin", "POST"))
      .status,
    200,
  );
});
test("many existing decks are preserved, purchase creates another deck instead of overwriting any slot", async () => {
  await database.insert(schema.decksTable).values(
    Array.from({ length: 40 }, (_, i) => ({
      id: "prior-" + i,
      userId: "partial",
      name: "기존 " + i,
      cardDefinitionIds: deck,
      championDefinitionId: "deck-hero",
    })),
  );
  const p = await create({ name: "슬롯 보존 검증" }),
    r = await buy("partial", p.id);
  assert.equal(r.status, 200);
  assert.equal(
    (await rows(schema.decksTable)).filter((d: any) => d.userId === "partial")
      .length,
    42,
  );
});
test("refresh and real logout/login preserve card collection, equipped deck and receipt", async () => {
  const before = (await api("/shop/decks", "buyer")).body.items.find(
    (p: any) => p.id === product.id,
  ).purchase;
  assert.equal((await api("/auth/logout", "buyer", "POST")).status, 200);
  assert.equal((await api("/shop/decks", "buyer")).status, 401);
  const r = await fetch(origin + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "buyer@shop-decks.invalid", password }),
  });
  assert.equal(r.status, 200);
  cookies.buyer = r.headers
    .getSetCookie()
    .find((c: string) => c.startsWith("ko_session="))!
    .split(";")[0]!;
  assert.deepEqual(
    (await api("/shop/decks", "buyer")).body.items.find(
      (p: any) => p.id === product.id,
    ).purchase,
    before,
  );
  assert.equal((await buy("buyer")).body.alreadyPurchased, true);
  assert.equal(await balance("buyer"), 700);
});
test("purchased deck enters actual PvP match server, mulligan and accepted card-play path", async () => {
  const r = await buy("opponent");
  assert.equal(r.status, 200);
  const waiting = await api("/online-matches", "buyer", "POST", {
    deckId: purchasedDeckId,
  });
  assert.equal(waiting.status, 201, JSON.stringify(waiting.body));
  const matchId = waiting.body.match.id;
  const joined = await api(
    "/online-matches/" + matchId + "/join",
    "opponent",
    "POST",
    { deckId: r.body.deckId },
  );
  runtime = await getRuntime(matchId);
  assert.equal(joined.status, 201, JSON.stringify(joined.body));
  assert.ok(runtime);
  await new Promise((r) => setTimeout(r, 4700));
  for (const user of ["buyer", "opponent"]) {
    const m = await applyMatchAction(
      matchId,
      user,
      randomUUID(),
      runtime.version,
      { type: "MULLIGAN", cardInstanceIds: [] },
    );
    assert.equal(m.ok, true, m.ok ? "" : m.message);
  }
  const user =
      runtime.state.activePlayerId === "PLAYER_ONE" ? "buyer" : "opponent",
    player = runtime.state.players.find(
      (p: any) => p.id === runtime.state.activePlayerId,
    ),
    card = player.hand.find((c: any) => c.currentCost <= player.currentGold);
  // Zero-cost fixture card is always in the drawn hand after retries only if available; use turn advance until affordable.
  let playable = card;
  for (let i = 0; !playable && i < 10; i++) {
    const u =
      runtime.state.activePlayerId === "PLAYER_ONE" ? "buyer" : "opponent";
    await applyMatchAction(matchId, u, randomUUID(), runtime.version, {
      type: "END_TURN",
    });
    const p = runtime.state.players.find(
      (p: any) => p.id === runtime.state.activePlayerId,
    );
    playable = p.hand.find((c: any) => c.currentCost <= p.currentGold);
  }
  const u =
    runtime.state.activePlayerId === "PLAYER_ONE" ? "buyer" : "opponent";
  assert.ok(playable);
  const played = await applyMatchAction(
    matchId,
    u,
    randomUUID(),
    runtime.version,
    {
      type: "PLAY_WRESTLER",
      cardInstanceId: playable.instanceId,
      boardSlot: 0,
    },
  );
  assert.equal(played.ok, true, played.ok ? "" : played.message);
});
test("legacy pack listing and purchase remain operational with the same currency ledger and inventory", async () => {
  await database
    .insert(schema.packDefinitionsTable)
    .values({ id: "legacy-pack", name: "기존 팩", status: "PUBLISHED" });
  await database.insert(schema.shopListingsTable).values({
    id: "legacy-listing",
    name: "기존 팩 상품",
    packDefinitionId: "legacy-pack",
    price: 20,
  });
  assert.equal((await api("/shop", "poor")).status, 200);
  const r = await api("/shop/legacy-listing/purchase", "buyer", "POST", {
    quantity: 1,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.currencyBalance, 680);
  assert.equal(r.body.ownedQuantity, 1);
});
test("additive migration can be reapplied and RLS prevents direct public data access", async () => {
  const before = (await rows(schema.shopDeckPurchasesTable)).length;
  await pg.exec(migration);
  assert.equal((await rows(schema.shopDeckPurchasesTable)).length, before);
  await pg.exec(
    "CREATE ROLE shop_deck_public; GRANT USAGE ON SCHEMA " +
      "public" +
      " TO shop_deck_public; GRANT SELECT,INSERT,UPDATE,DELETE ON shop_decks,shop_deck_purchases TO shop_deck_public",
  );
  try {
    await pg.exec("SET ROLE shop_deck_public");
    const result = await pg.exec("SELECT * FROM shop_deck_purchases");
    assert.equal(useNative ? result.rows.length : result[0].rows.length, 0);
    await assert.rejects(
      pg.exec(
        "INSERT INTO shop_decks(id,name,price) VALUES('forged','forged',0)",
      ),
    );
  } finally {
    await pg.exec("RESET ROLE");
    await pg.exec("DROP OWNED BY shop_deck_public; DROP ROLE shop_deck_public");
  }
});
test("deleting a purchased deck leaves acquired cards and permanent receipt intact, without a retry granting again", async () => {
  const p = await create({ name: "삭제 가능 덱 검증", price: 0 }),
    r = await buy("no-champion", p.id);
  assert.equal(r.status, 422);
  const bought = await buy("included", p.id);
  assert.equal(bought.status, 200);
  const before = (await rows(schema.userCardCollectionsTable)).filter(
    (c: any) => c.userId === "included",
  );
  assert.equal(
    (await api("/decks/" + bought.body.deckId, "included", "DELETE")).status,
    200,
  );
  const retry = await buy("included", p.id);
  assert.equal(retry.body.alreadyPurchased, true);
  assert.deepEqual(
    (await rows(schema.userCardCollectionsTable)).filter(
      (c: any) => c.userId === "included",
    ),
    before,
  );
  assert.equal(
    (await api("/decks", "included")).body.decks.some(
      (d: any) => d.id === bought.body.deckId,
    ),
    false,
  );
});
test("two different products share the existing wallet lock and cannot jointly overspend", async () => {
  await addUser("wallet-race", 500);
  const a = await create({ name: "동시 상품 A" }),
    b = await create({ name: "동시 상품 B" });
  const result = await Promise.all([
    buy("wallet-race", a.id),
    buy("wallet-race", b.id),
  ]);
  assert.deepEqual(result.map((r) => r.status).sort(), [200, 422]);
  assert.equal(await balance("wallet-race"), 200);
  assert.equal(
    (await rows(schema.shopDeckPurchasesTable)).filter(
      (p: any) => p.userId === "wallet-race",
    ).length,
    1,
  );
});
test("a newly unpublished recommended champion is not leaked or sold without the explicit flag", async () => {
  const p = await create({ name: "추천 공개 상태 재검증" });
  await database
    .update(schema.championsTable)
    .set({ status: "DRAFT" })
    .where(eq(schema.championsTable.id, "included-hero"));
  try {
    const item = (await api("/shop/decks", "buyer")).body.items.find(
      (i: any) => i.id === p.id,
    );
    assert.ok(item.unavailable);
    assert.equal(item.recommendedChampion, null);
    assert.equal((await buy("poor", p.id)).status, 409);
  } finally {
    await database
      .update(schema.championsTable)
      .set({ status: "PUBLISHED" })
      .where(eq(schema.championsTable.id, "included-hero"));
  }
});
test("exact SQL migration creates fresh tables, reapplies without data loss and rolls back inside an isolated schema", async () => {
  const client = native ? await native.connect() : null;
  const exec = (query: string) =>
    client ? client.query(query) : pg.exec(query);
  const query = (query: string) =>
    client ? client.query(query) : pg.query(query);
  try {
    await exec("BEGIN");
    await exec("CREATE SCHEMA fresh_shop_deck_qa");
    await exec("SET LOCAL search_path=fresh_shop_deck_qa");
    await exec(
      "CREATE TABLE users(id text PRIMARY KEY); INSERT INTO users(id) VALUES('preserved')",
    );
    await exec(migration);
    await exec(
      "INSERT INTO shop_decks(id,name,price) VALUES('sample','fresh SQL product',0)",
    );
    await exec(
      "INSERT INTO shop_deck_purchases(id,user_id,product_id,deck_id,price,receipt) VALUES('receipt','preserved','sample','deck-id',0,'{}')",
    );
    await exec(migration);
    assert.equal(
      (await query("SELECT count(*)::int AS n FROM shop_deck_purchases"))
        .rows[0].n,
      1,
    );
    assert.equal(
      (await query("SELECT count(*)::int AS n FROM users")).rows[0].n,
      1,
    );
    await exec("ROLLBACK");
    assert.equal(
      (await query("SELECT to_regnamespace('fresh_shop_deck_qa') AS schema"))
        .rows[0].schema,
      null,
    );
  } finally {
    await exec("ROLLBACK");
    client?.release();
  }
});
after(async () => {
  if (runtime) {
    await api(
      "/online-matches/" + runtime.matchId + "/abandon",
      "buyer",
      "POST",
    );
    runtime.state.status = "FINISHED";
    cleanupMatchRuntime(runtime.matchId);
  }
  if (process.env.KO_SHOP_DECKS_BROWSER_MODE === "1") {
    await mkdir("qa-results/shop-decks", { recursive: true });
    await writeFile("qa-results/shop-decks/upload.png", png);
    await writeFile(
      "qa-results/shop-decks/fixture.json",
      JSON.stringify({
        origin,
        cookies,
        password,
        productId: product.id,
        purchasedDeckId,
        deck,
        cards,
      }),
    );
    console.log("SHOP_DECKS_BROWSER_READY " + origin);
    await new Promise<void>((resolve) => process.once("SIGTERM", resolve));
  }
  for (const socket of connections) socket.destroy();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(r));
  await pool.end();
  await pg.close();
});
