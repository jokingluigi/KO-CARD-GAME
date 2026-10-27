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
import { and, eq, sql } from "drizzle-orm";
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
  new URL("../migrations/0053_cosmetics.sql", import.meta.url),
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
  process.env.KO_COSMETICS_BROWSER_MODE === "1"
    ? Number(process.env.KO_COSMETICS_FIXTURE_PORT ?? 5186)
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
const {
  startOnlineMatch,
  getRuntime,
  cleanupMatchRuntime,
  snapshotMessage,
  applyMatchAction,
} = await import("../../../artifacts/api-server/src/online/service");
const { loadCosmetics, equipCosmetic } =
  await import("../../../artifacts/api-server/src/lib/cosmetics");
const { cosmeticImage } = await import("../../cosmetics/src/index");
const password = "Local-only-fixture-123!";
const hash = await hashPassword(password);
const cookies: Record<string, string> = {};
for (const id of ["admin", "player-a", "player-b"]) {
  await database.insert(schema.usersTable).values({
    id,
    email: id + "@cosmetics.invalid",
    nickname: id,
    passwordHash: hash,
    role: id === "admin" ? "ADMIN" : "USER",
    shopCurrencyStarterGrantedAt: new Date(),
  });
  const token = "cosmetics-local-" + id;
  cookies[id] = "ko_session=" + token;
  await database.insert(schema.sessionsTable).values({
    id: "session-" + id,
    userId: id,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 24 * 3600000),
  });
}
const sharp = require("sharp");
const png = await sharp({
  create: { width: 200, height: 280, channels: 4, background: "#9b67c1" },
})
  .png()
  .toBuffer();
const original = await sharp({
  create: { width: 200, height: 280, channels: 4, background: "#34597a" },
})
  .png()
  .toBuffer();
root.get("/api/qa-cosmetics/:file", (req: any, res: any) =>
  res.type("png").send(req.params.file === "original.png" ? original : png),
);
const cards = Array.from({ length: 9 }, (_, i) => ({
  id: "cosmetic-unit-" + i,
  name: i === 0 ? "꾸미기 검증 선수" : "검증 선수 " + i,
  cardType: "WRESTLER",
  cost: 0,
  attack: 1,
  health: 5,
  text: "",
  status: "PUBLISHED",
  imageUrl: origin + "/api/qa-cosmetics/original.png",
}));
await database.insert(schema.cardsTable).values(cards);
await database.insert(schema.cardsTable).values({
  id: "unsupported-token",
  name: "토큰",
  cardType: "WRESTLER",
  cost: 0,
  attack: 1,
  health: 1,
  text: "",
  isToken: true,
});
await database.insert(schema.championsTable).values({
  id: "cosmetic-hero",
  name: "꾸미기 검증 챔피언",
  abilityName: "휴식",
  abilityCost: 0,
  abilityText: "효과 없음",
  abilityEffects: {},
  status: "PUBLISHED",
  imageUrl: origin + "/api/qa-cosmetics/original.png",
});
const deck = cards.flatMap((c, i) => Array(i === 8 ? 1 : 3).fill(c.id));
for (const userId of ["player-a", "player-b"]) {
  await database.insert(schema.decksTable).values({
    id: "deck-" + userId,
    userId,
    name: "꾸미기 검증 덱",
    championDefinitionId: "cosmetic-hero",
    cardDefinitionIds: deck,
    isSelected: true,
  });
  await database
    .insert(schema.userCardCollectionsTable)
    .values(
      cards.map((c) => ({ userId, cardDefinitionId: c.id, quantity: 3 })),
    );
  await database
    .insert(schema.userChampionCollectionsTable)
    .values({ userId, championDefinitionId: "cosmetic-hero", owned: true });
}
await database.insert(schema.aiDecksTable).values({
  id: "cosmetic-ai",
  name: "검증 AI",
  enabled: true,
  championDefinitionId: "cosmetic-hero",
  cardDefinitionIds: deck,
});
async function api(
  path: string,
  user = "admin",
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(origin + "/api" + path, {
    method,
    headers: {
      cookie: cookies[user] ?? "",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
  };
}
const registered: Record<string, any> = {};
let uploaded = "";
let runtime: any;
const prefix = "/admin/cosmetics";
test("authentication: anonymous and ordinary accounts cannot manage or grant cosmetics", async () => {
    assert.equal((await api('/COSMETICS','anonymous')).status,401);
    assert.equal((await api('/Admin/Cosmetics','player-a')).status,403);

  for (const [user, status] of [
    ["anonymous", 401],
    ["player-a", 403],
  ])
    for (const [path, method] of [
      [prefix, "GET"],
      [prefix + "/items", "POST"],
      [prefix + "/users/player-a/grants", "POST"],
      [prefix + "/uploads", "POST"],
    ])
      assert.equal((await api(path!, user, method)).status, Number(status));
  assert.equal((await api("/cosmetics", "anonymous")).status, 401);
});
test("actual storage upload: signed PUT, decoded PNG verification, durable serving, invalid types rejected", async () => {
  assert.equal(
    (
      await api(prefix + "/uploads", "admin", "POST", {
        name: "bad.svg",
        size: 10,
        contentType: "image/svg+xml",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(prefix + "/uploads", "admin", "POST", {
        name: "big.png",
        size: 6 * 1024 * 1024,
        contentType: "image/png",
      })
    ).status,
    400,
  );
  const requested = await api(prefix + "/uploads", "admin", "POST", {
    name: "skin.png",
    size: png.length,
    contentType: "image/png",
  });
  assert.equal(requested.status, 200, JSON.stringify(requested.body));
  const put = await fetch(requested.body.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: png,
  });
  assert.equal(put.status, 200);
  const complete = await api(prefix + "/uploads/complete", "admin", "POST", {
    objectPath: requested.body.objectPath,
    contentType: "image/png",
  });
  assert.equal(complete.status, 200, JSON.stringify(complete.body));
  uploaded = complete.body.imageUrl;
  assert.equal((await fetch(origin + uploaded)).status, 200);
  const bad = await api(prefix + "/uploads", "admin", "POST", {
    name: "bad.png",
    size: 4,
    contentType: "image/png",
  });
  await fetch(bad.body.uploadURL, { method: "PUT", body: Buffer.from("fake") });
  assert.equal(
    (
      await api(prefix + "/uploads/complete", "admin", "POST", {
        objectPath: bad.body.objectPath,
        contentType: "image/png",
      })
    ).status,
    400,
  );
  assert.equal((await api(prefix+'/items','admin','POST',{type:'IMAGE_EMOTE',name:'위장 파일 등록 거부',description:'',targetId:null,imageAssets:{art:'/api/storage'+bad.body.objectPath},isActive:true,sortOrder:0})).status,400);
});
test("admin registers all four types, selects real DB targets, rejects unsupported tokens and unsafe assets", async () => {
  for (const type of [
    "CHAMPION_SKIN",
    "CARD_SKIN",
    "CARD_BACK",
    "IMAGE_EMOTE",
  ]) {
    const input = {
      type,
      name: "검증 " + type,
      description: "격리 DB 검증 아이템",
      targetId:
        type === "CHAMPION_SKIN"
          ? "cosmetic-hero"
          : type === "CARD_SKIN"
            ? cards[0]!.id
            : null,
      imageAssets:
        type === "CHAMPION_SKIN"
          ? {
              art: uploaded,
              portrait: uploaded,
              intro: uploaded,
              awakened: uploaded,
            }
          : { art: uploaded },
      isActive: true,
      sortOrder: 0,
    };
    const created = await api(prefix + "/items", "admin", "POST", input);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    registered[type] = created.body.item;
  }
  assert.equal((await api(prefix)).body.items.length, 4);
  assert.equal(
    (
      await api(prefix + "/items", "admin", "POST", {
        ...registered.CARD_SKIN,
        targetId: "unsupported-token",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await api(prefix + "/items", "admin", "POST", {
        ...registered.CARD_BACK,
        imageAssets: { art: "javascript:alert(1)" },
      })
    ).status,
    400,
  );
});
test("idempotent grants, own inventory isolation, authoritative equip and four distinct persistent emote slots", async () => {
  for (const item of Object.values(registered) as any[])
    for (let n = 0; n < 2; n++)
      assert.equal(
        (
          await api(prefix + "/users/player-a/grants", "admin", "POST", {
            cosmeticId: item.id,
            action: "GRANT",
          })
        ).status,
        200,
      );
  assert.equal((await api("/cosmetics", "player-a")).body.owned.length, 4);
  assert.equal((await api("/cosmetics", "player-b")).body.owned.length, 0);
  assert.equal(
    (
      await api("/cosmetics/equipment", "player-b", "PUT", {
        slot: "back",
        cosmeticId: registered.CARD_BACK.id,
      })
    ).status,
    403,
  );
  for (const [type, slot] of [
    ["CHAMPION_SKIN", "champion:cosmetic-hero"],
    ["CARD_SKIN", "card:" + cards[0]!.id],
    ["CARD_BACK", "back"],
    ["IMAGE_EMOTE", "emote:1"],
  ])
    assert.equal(
      (
        await api("/cosmetics/equipment", "player-a", "PUT", {
          slot,
          cosmeticId: registered[type!].id,
        })
      ).status,
      200,
    );
  assert.equal(
    (
      await api("/cosmetics/equipment", "player-a", "PUT", {
        slot: "emote:5",
        cosmeticId: registered.IMAGE_EMOTE.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api("/cosmetics/equipment", "player-a", "PUT", {
        slot: "card:wrong",
        cosmeticId: registered.CARD_SKIN.id,
      })
    ).status,
    422,
  );
  await equipCosmetic("player-a", "emote:4", registered.IMAGE_EMOTE.id);
  let loadout = await loadCosmetics("player-a");
  assert.equal(loadout.emotes[0], null);
  assert.equal(loadout.emotes[3]?.id, registered.IMAGE_EMOTE.id);
  await equipCosmetic("player-a", "emote:1", registered.IMAGE_EMOTE.id);
  for (let n = 2; n <= 4; n++) {
    const item = (
      await api(prefix + "/items", "admin", "POST", {
        ...registered.IMAGE_EMOTE,
        name: "검증 이모티콘 " + n,
      })
    ).body.item;
    await api(prefix + "/users/player-a/grants", "admin", "POST", {
      cosmeticId: item.id,
      action: "GRANT",
    });
    await equipCosmetic("player-a", "emote:" + n, item.id);
  }
  loadout = await loadCosmetics("player-a");
  assert.equal(new Set(loadout.emotes.map((i) => i!.id)).size, 4);
  // Ownership composite FK rejects even direct accidental server inserts, independent of API.
  await assert.rejects(() =>
    database.insert(schema.equippedCosmeticsTable).values({
      userId: "player-b",
      slot: "back",
      cosmeticId: registered.CARD_BACK.id,
    }),
  );
});
test("actual session logout/login preserves database equipment", async () => {
  const before = await loadCosmetics("player-a");
  await api("/auth/logout", "player-a", "POST");
  const response = await fetch(origin + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "player-a@cosmetics.invalid", password }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  cookies["player-a"] = response.headers.get("set-cookie")!.split(";")[0]!;
  assert.deepEqual(
    (await api("/cosmetics", "player-a")).body.loadout,
    JSON.parse(JSON.stringify(before)),
  );
});
test("two-user actual PvP start freezes both loadouts without changing card/champion definitions or hidden state", async () => {
  // Give B a distinct equipped back and emote too.
  const signed = await api(prefix + "/uploads", "admin", "POST", {
    name: "opponent.png",
    size: original.length,
    contentType: "image/png",
  });
  await fetch(signed.body.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: original,
  });
  const secondAsset = await api(prefix + "/uploads/complete", "admin", "POST", {
    objectPath: signed.body.objectPath,
    contentType: "image/png",
  });
  assert.equal(secondAsset.status, 200);
  for (const type of ["CARD_BACK", "IMAGE_EMOTE"]) {
    const created = await api(prefix + "/items", "admin", "POST", {
      ...registered[type],
      name: type === "CARD_BACK" ? "상대 검증 카드 뒷면" : "상대 검증 이모티콘",
      imageAssets: { art: secondAsset.body.imageUrl },
    });
    assert.equal(created.status, 201);
    registered["B_" + type] = created.body.item;
    await api(prefix + "/users/player-b/grants", "admin", "POST", {
      cosmeticId: created.body.item.id,
      action: "GRANT",
    });
    await equipCosmetic(
      "player-b",
      type === "CARD_BACK" ? "back" : "emote:1",
      created.body.item.id,
    );
  }
  runtime = await startOnlineMatch(
    "player-a",
    "deck-player-a",
    "player-b",
    "deck-player-b",
  );
  const initial = structuredClone(runtime.state);
  assert.equal(
    runtime.snapshot.cosmetics.PLAYER_ONE.skins["card:" + cards[0]!.id].id,
    registered.CARD_SKIN.id,
  );
  assert.equal(
    runtime.snapshot.cosmetics.PLAYER_TWO.cardBack.id,
    registered.B_CARD_BACK.id,
  );
  for (const userId of ["player-a", "player-b"]) {
    const snapshot: any = snapshotMessage(runtime, userId);
    assert.deepEqual(snapshot.cosmetics, runtime.snapshot.cosmetics);
    const enemy = snapshot.state.players.find(
      (p: any) =>
        p.id !== (userId === "player-a" ? "PLAYER_ONE" : "PLAYER_TWO"),
    );
    assert.equal(enemy.hand.hidden, true);
    assert.equal(enemy.deck.hidden, true);
    assert.equal("userId" in snapshot.cosmetics.PLAYER_ONE, false);
  }
  await equipCosmetic("player-a", "back", null);
  assert.equal(
    runtime.snapshot.cosmetics.PLAYER_ONE.cardBack.id,
    registered.CARD_BACK.id,
  );
  assert.deepEqual(runtime.state, initial);
});
test("WebSocket image emotes broadcast to both accounts, reject spoofed slots, dedupe and rate limit, leave RNG/turn/state/version untouched", async () => {
  assert.ok(runtime);
  const { WebSocket } = require("ws");
  const sockets: any[] = [];
  const messages: any[][] = [[], []];
  for (let i = 0; i < 2; i++) {
    const ws = new WebSocket(
      origin.replace("http:", "ws:") + "/api/online-matches/ws",
      { headers: { cookie: cookies[i ? "player-b" : "player-a"] } },
    );
    sockets.push(ws);
    ws.on("message", (bytes: Buffer) =>
      messages[i]!.push(JSON.parse(bytes.toString())),
    );
    await new Promise((r) => ws.once("open", r));
    ws.send(JSON.stringify({ type: "SUBSCRIBE", matchId: runtime.matchId }));
  }
  const wait = async (check: () => boolean) => {
    const end = Date.now() + 5000;
    while (!check()) {
      if (Date.now() > end) throw new Error("websocket fixture timeout");
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  await wait(() =>
    messages.every((m) => m.some((v) => v.type === "MATCH_SNAPSHOT")),
  );
  const before = JSON.stringify(runtime.state),
    version = runtime.version;
  const payload = {
    type: "IMAGE_EMOTE",
    matchId: runtime.matchId,
    requestId: "qa-once",
    slot: 1,
  };
  sockets[0].send(JSON.stringify(payload));
  await wait(() =>
    messages.every((m) => m.some((v) => v.type === "IMAGE_EMOTE")),
  );
  sockets[0].send(JSON.stringify(payload));
  sockets[0].send(JSON.stringify({ ...payload, requestId: "too-soon" }));
  sockets[0].send(
    JSON.stringify({ ...payload, slot: 9, requestId: "invalid" }),
  );
  await new Promise((r) => setTimeout(r, 100));
  for (const m of messages)
    assert.equal(m.filter((v) => v.type === "IMAGE_EMOTE").length, 1);
  sockets[1].send(JSON.stringify({ ...payload, requestId: "opponent" }));
  await wait(() =>
    messages.every(
      (m) => m.filter((v) => v.type === "IMAGE_EMOTE").length === 2,
    ),
  );
  assert.equal(JSON.stringify(runtime.state), before);
  assert.equal(runtime.version, version);
  for (const ws of sockets) ws.close();
  await new Promise((r) => setTimeout(r, 100));
});
test("server runtime eviction/recovery restores frozen cosmetics and exact existing combat state", async () => {
  const previous = JSON.stringify(runtime.state),
    id = runtime.matchId,
    cosmetics = structuredClone(runtime.snapshot.cosmetics);
  cleanupMatchRuntime(id);
  runtime.state.status = "FINISHED";
  runtime = await getRuntime(id);
  assert.ok(runtime);
  assert.equal(JSON.stringify(runtime.state), previous);
  assert.deepEqual(runtime.snapshot.cosmetics, cosmetics);
});
test("disable preserves ownership, prevents new grants/equipment, original fallback; re-targeting unequips and revocation cascades", async () => {
  const item = registered.CARD_SKIN;
  const key=uploaded.replace('/api/storage/objects/',''),savedAsset=assets.get(key)!;
  assets.delete(key);
  assert.equal(
    (
      await api(prefix + "/items/" + item.id, "admin", "PATCH", {
        ...item,
        isActive: false,
      })
    ).status,
    200,
  );
  assets.set(key,savedAsset);
  assert.ok(
    (await api("/cosmetics", "player-a")).body.owned.some(
      (o: any) => o.item.id === item.id,
    ),
  );
  assert.equal(
    (await loadCosmetics("player-a")).skins["card:" + cards[0]!.id],
    undefined,
  );
  assert.equal(
    cosmeticImage(
      await loadCosmetics("player-a"),
      "CARD_SKIN",
      cards[0]!.id,
      "art",
      "original",
    ),
    "original",
  );
  assert.equal(
    (
      await api(prefix + "/users/player-b/grants", "admin", "POST", {
        cosmeticId: item.id,
        action: "GRANT",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await api("/cosmetics/equipment", "player-a", "PUT", {
        slot: "card:" + cards[0]!.id,
        cosmeticId: item.id,
      })
    ).status,
    403,
  );
  await api(prefix + "/items/" + item.id, "admin", "PATCH", item);
  await equipCosmetic("player-a", "card:" + cards[0]!.id, item.id);
  await api(prefix + "/items/" + item.id, "admin", "PATCH", {
    ...item,
    targetId: cards[1]!.id,
  });
  assert.equal(
    (await loadCosmetics("player-a")).skins["card:" + cards[0]!.id],
    undefined,
  );
  await api(prefix + "/items/" + item.id, "admin", "PATCH", item);
  await equipCosmetic("player-a", "card:" + cards[0]!.id, item.id);
  await api(prefix + "/users/player-a/grants", "admin", "POST", {
    cosmeticId: item.id,
    action: "REVOKE",
  });
  assert.equal(
    (await loadCosmetics("player-a")).skins["card:" + cards[0]!.id],
    undefined,
  );
  // Restore local fixture for the interactive browser checks only.
  await api(prefix + "/users/player-a/grants", "admin", "POST", {
    cosmeticId: item.id,
    action: "GRANT",
  });
  await equipCosmetic("player-a", "card:" + cards[0]!.id, item.id);
  await equipCosmetic("player-a", "back", registered.CARD_BACK.id);
});
test("slot image fallback and final-definition/controller resolution are independent from original combat definitions", () => {
  const a = {
    version: 1 as const,
    skins: {
      ["card:" + cards[0]!.id]: registered.CARD_SKIN,
      ["champion:cosmetic-hero"]: registered.CHAMPION_SKIN,
    },
    emotes: [null, null, null, null],
    cardBack: null,
  };
  assert.equal(
    cosmeticImage(a, "CARD_SKIN", cards[0]!.id, "art", "original"),
    uploaded,
  );
  assert.equal(
    cosmeticImage(a, "CARD_SKIN", cards[1]!.id, "art", "transformed-original"),
    "transformed-original",
  );
  assert.equal(
    cosmeticImage(
      undefined,
      "CARD_SKIN",
      cards[0]!.id,
      "art",
      "opponent-original",
    ),
    "opponent-original",
  );
  assert.equal(
    cosmeticImage(
      {
        ...a,
        skins: {
          "champion:cosmetic-hero": {
            ...registered.CHAMPION_SKIN,
            imageAssets: { portrait: uploaded },
          },
        },
      },
      "CHAMPION_SKIN",
      "cosmetic-hero",
      "awakened",
      "original-awakened",
    ),
    "original-awakened",
  );
  assert.equal(
    cosmeticImage(a, "CARD_SKIN", "unsupported-token", "art", "original-token"),
    "original-token",
  );
});
test("malformed presentation metadata falls back without crashing combat rendering", () => {
  assert.equal(
    cosmeticImage({} as never, "CARD_SKIN", cards[0]!.id, "art", "original"),
    "original",
  );
  assert.equal(
    cosmeticImage(
      {
        skins: {
          ["card:" + cards[0]!.id]: {
            type: "CARD_SKIN",
            targetId: cards[0]!.id,
            imageAssets: null,
          },
        },
      } as never,
      "CARD_SKIN",
      cards[0]!.id,
      "art",
      "original",
    ),
    "original",
  );
});
test("cosmetic dependency failure or stalled read returns original defaults within a bounded match-start delay", async () => {
  const { loadMatchCosmetics } =
    await import("../../../artifacts/api-server/src/lib/cosmetics");
  const start = performance.now();
  const stalled = await loadMatchCosmetics(
    "player-a",
    () => new Promise(() => {}),
    15,
  );
  assert.equal(stalled.cardBack, null);
  assert.ok(performance.now() - start < 1000);
  assert.deepEqual(
    await loadMatchCosmetics("player-a", async () => {
      throw new Error("isolated database outage");
    }),
    stalled,
  );
});
test("RLS denies direct untrusted SQL clients; schema change is idempotent and original card catalog is untouched", async () => {
  await pg.exec(
    "CREATE ROLE cosmetic_anon; GRANT USAGE ON SCHEMA public TO cosmetic_anon; GRANT SELECT,INSERT,UPDATE,DELETE ON cosmetic_items,user_cosmetics,user_equipped_cosmetics,cosmetic_audit TO cosmetic_anon",
  );
  await pg.exec("SET ROLE cosmetic_anon");
  try {
    assert.equal(
      (await pg.query("SELECT * FROM user_cosmetics")).rows.length,
      0,
    );
    await assert.rejects(() =>
      pg.exec(
        "INSERT INTO cosmetic_items(id,type,name) VALUES('forged','IMAGE_EMOTE','forged')",
      ),
    );
  } finally {
    await pg.exec("RESET ROLE");
  }
  for (const c of cards) {
    const [row] = await database
      .select()
      .from(schema.cardsTable)
      .where(eq(schema.cardsTable.id, c.id));
    for (const k of ["cost", "attack", "health", "text", "imageUrl"])
      assert.equal((row as any)[k], (c as any)[k]);
  }
  await pg.exec(migration);
  assert.ok(
    (await database.select().from(schema.cosmeticItemsTable)).length >= 4,
  );
});
test("champion skin token set: validated linkage, existing owner, actual single/bulk pack claims, equip/fallback/revoke", async () => {
  await database.insert(schema.cardsTable).values({ id: "set-token", name: "세트 챔피언 토큰", cardType: "WRESTLER", rarity: "CHAMPION", cost: 0, attack: 5, health: 6, text: "", imageUrl: origin + "/api/qa-cosmetics/original.png", status: "PUBLISHED", isToken: true, isChampionToken: true });
  await database.update(schema.championsTable).set({ championTokenDefinitionId: "set-token" }).where(eq(schema.championsTable.id, "cosmetic-hero"));
  const item = registered.CHAMPION_SKIN;
  // Existing owner does not need another grant when token art is attached later.
  const patched = await api(prefix + "/items/" + item.id, "admin", "PATCH", { ...item, imageAssets: { ...item.imageAssets, "token:set-token": uploaded } });
  assert.equal(patched.status, 200, JSON.stringify(patched.body));
  const set = patched.body.item;
  registered.CHAMPION_SKIN = set;
  assert.equal(cosmeticImage(await loadCosmetics("player-a"), "CARD_SKIN", "set-token", "art", "base"), uploaded);
  assert.equal(cosmeticImage(await loadCosmetics("player-b"), "CARD_SKIN", "set-token", "art", "base"), "base");
  assert.equal((await api(prefix + "/items/" + item.id, "admin", "PATCH", { ...set, imageAssets: { ...item.imageAssets, "token:wrong": uploaded } })).status, 422);
  await database.update(schema.championsTable).set({ championTokenDefinitionId: null }).where(eq(schema.championsTable.id, "cosmetic-hero"));
  assert.equal(cosmeticImage(await loadCosmetics("player-a"), "CARD_SKIN", "set-token", "art", "base"), "base");
  await database.update(schema.championsTable).set({ championTokenDefinitionId: "set-token" }).where(eq(schema.championsTable.id, "cosmetic-hero"));
  const packId = "set-pack";
  await database.insert(schema.packDefinitionsTable).values({ id: packId, name: "세트 팩", status: "PUBLISHED", cardsPerPack: 1, normalRate: 0, legendaryRate: 0, championRate: 100, championPool: ["cosmetic-hero"], skinChance: 100, skinPool: [item.id] });
  await database.insert(schema.userPackInventoryTable).values({ userId: "player-b", packDefinitionId: packId, quantity: 3 });
  const details = await api("/packs/" + packId + "/details", "player-b");
  assert.equal(details.status, 200, JSON.stringify(details.body));
  assert.equal(details.body.details.skins[0].individualProbability, 100);
  const open = async (bulk: boolean, key: string) => {
    const response = await fetch(origin + "/api/packs/" + packId + (bulk ? "/open-bulk" : "/open"), { method: "POST", headers: { cookie: cookies["player-b"]!, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(bulk ? { quantity: 2 } : {}) });
    return { status: response.status, body: await response.json() };
  };
  await database.update(schema.userChampionCollectionsTable).set({ owned: false }).where(eq(schema.userChampionCollectionsTable.userId, "player-b"));
  const first = await open(false, "set-first");
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.rewards[0].rewardType, "CHAMPION_SKIN");
  assert.equal(first.body.rewards[0].alreadyOwned, false);
  assert.equal(first.body.rewards[0].originalGranted, true);
  assert.deepEqual((await open(false, "set-first")).body, first.body);
  const bulk = await open(true, "set-bulk");
  assert.equal(bulk.status, 200, JSON.stringify(bulk.body));
  assert.equal(bulk.body.openings.length, 2);
  assert.ok(bulk.body.openings.every((o: any) => o.rewards[0].alreadyOwned === true && o.rewards[0].originalGranted === false));
  assert.deepEqual((await open(true, "set-bulk")).body, bulk.body);
  const inventory = await api("/cosmetics", "player-b");
  assert.equal(inventory.body.owned.filter((o: any) => o.item.id === item.id).length, 1);
  await equipCosmetic("player-b", "champion:cosmetic-hero", item.id);
  assert.equal(cosmeticImage(await loadCosmetics("player-b"), "CARD_SKIN", "set-token", "art", "base"), uploaded);
  await equipCosmetic("player-b", "champion:cosmetic-hero", null);
  assert.equal(cosmeticImage(await loadCosmetics("player-b"), "CARD_SKIN", "set-token", "art", "base"), "base");
  await equipCosmetic("player-b", "champion:cosmetic-hero", item.id);
  await api(prefix + "/users/player-b/grants", "admin", "POST", { cosmeticId: item.id, action: "REVOKE" });
  assert.equal(cosmeticImage(await loadCosmetics("player-b"), "CARD_SKIN", "set-token", "art", "base"), "base");
  const options = await api("/admin/packs/options");
  assert.ok(options.body.skins.some((skin: any) => skin.id === item.id));
  const forced = await api("/admin/packs/" + packId + "/preview/forced", "admin", "POST", { slots: [{ type: "SKIN", id: item.id }] });
  assert.equal(forced.status, 200, JSON.stringify(forced.body));
  assert.equal(forced.body.rewards[0].rewardType, "CHAMPION_SKIN");
  assert.equal(forced.body.rewards[0].cosmetic.imageAssets["token:set-token"], uploaded);
  const [token] = await database.select().from(schema.cardsTable).where(eq(schema.cardsTable.id, "set-token"));
  assert.equal(token!.attack, 5); assert.equal(token!.health, 6);
  // Ordinary card skins also include exactly one missing original, including a zero-quantity row.
  await database.insert(schema.cardSkinDefinitionsTable).values({ id: "pack-card-skin", cardDefinitionId: cards[0]!.id, name: "팩 카드 스킨", status: "PUBLISHED", imageUrl: uploaded });
  await database.update(schema.packDefinitionsTable).set({ skinPool: ["pack-card-skin"] }).where(eq(schema.packDefinitionsTable.id, packId));
  await database.update(schema.userPackInventoryTable).set({ quantity: 3 }).where(eq(schema.userPackInventoryTable.packDefinitionId, packId));
  await database.update(schema.userCardCollectionsTable).set({ quantity: 0 }).where(and(eq(schema.userCardCollectionsTable.userId, "player-b"), eq(schema.userCardCollectionsTable.cardDefinitionId, cards[0]!.id)));
  const cardFirst = await open(false, "card-set-first");
  assert.equal(cardFirst.status, 200, JSON.stringify(cardFirst.body));
  assert.equal(cardFirst.body.rewards[0].originalGranted, true);
  const cardBulk = await open(true, "card-set-bulk");
  assert.equal(cardBulk.status, 200, JSON.stringify(cardBulk.body));
  assert.ok(cardBulk.body.openings.every((o: any) => o.rewards[0].originalGranted === false));
  assert.deepEqual((await open(true, "card-set-bulk")).body, cardBulk.body);
  const [base] = await database.select().from(schema.userCardCollectionsTable).where(and(eq(schema.userCardCollectionsTable.userId, "player-b"), eq(schema.userCardCollectionsTable.cardDefinitionId, cards[0]!.id)));
  assert.equal(base!.quantity, 1);
  const { grantSkinOriginal } = await import("../../../artifacts/api-server/src/lib/skin-original-grant");
  await database.delete(schema.userCardCollectionsTable).where(and(eq(schema.userCardCollectionsTable.userId, "player-b"), eq(schema.userCardCollectionsTable.cardDefinitionId, cards[0]!.id)));
  await assert.rejects(() => database.transaction(async tx => { assert.equal(await grantSkinOriginal(tx, "player-b", "CARD", cards[0]!.id), true); throw new Error("claim failure"); }));
  assert.equal((await database.select().from(schema.userCardCollectionsTable).where(and(eq(schema.userCardCollectionsTable.userId, "player-b"), eq(schema.userCardCollectionsTable.cardDefinitionId, cards[0]!.id)))).length, 0);
  await database.transaction(async tx => { assert.equal(await grantSkinOriginal(tx, "player-b", "CARD", cards[0]!.id), true); assert.equal(await grantSkinOriginal(tx, "player-b", "CARD", cards[0]!.id), false); });
});

test("all administrator accounts unlock current/new skins; users and non-skin items stay isolated", async () => {
  const { ensureAdminSkins } = await import("../../../artifacts/api-server/src/lib/admin-skin-access");
  for (const id of ["admin", "second-admin"]) {
    if (id !== "admin") await database.insert(schema.usersTable).values({ id, email: id + "@cosmetics.invalid", nickname: id, passwordHash: hash, role: "ADMIN" });
    await ensureAdminSkins(id);
    const owned = await database.select().from(schema.userCosmeticsTable).where(eq(schema.userCosmeticsTable.userId, id));
    for (const type of ["CHAMPION_SKIN", "CARD_SKIN"]) assert.ok(owned.some(row => row.cosmeticId === registered[type].id));
    assert.ok(!owned.some(row => row.cosmeticId === registered.CARD_BACK.id || row.cosmeticId === registered.IMAGE_EMOTE.id));
    const legacy = await database.select().from(schema.userCardSkinCollectionsTable).where(eq(schema.userCardSkinCollectionsTable.userId, id));
    assert.ok(legacy.some(row => row.skinDefinitionId === "pack-card-skin"));
    await ensureAdminSkins(id);
    assert.equal((await database.select().from(schema.userCosmeticsTable).where(eq(schema.userCosmeticsTable.userId, id))).length, owned.length);
  }
  const created = await api(prefix + "/items", "admin", "POST", { ...registered.CHAMPION_SKIN, name: "새 관리자 자동 해금 스킨" });
  assert.equal(created.status, 201);
  const skin = created.body.item;
  const inventory = await api("/cosmetics", "admin");
  assert.ok(inventory.body.owned.some((o: any) => o.item.id === skin.id));
  const equipped = await api("/cosmetics/equipment", "admin", "PUT", { slot: "champion:cosmetic-hero", cosmeticId: skin.id });
  assert.equal(equipped.status, 200, JSON.stringify(equipped.body));
  assert.equal(equipped.body.loadout.skins["champion:cosmetic-hero"].id, skin.id);
  assert.equal((await api(prefix + "/users/admin/grants", "admin", "POST", { cosmeticId: skin.id, action: "REVOKE" })).status, 422);
  assert.equal(cosmeticImage(equipped.body.loadout, "CARD_SKIN", "set-token", "art", "base"), uploaded);
  // No inventory lookup is required before equipping a newly registered administrator skin.
  const direct = await api(prefix + "/items", "admin", "POST", { ...skin, name: "직접 관리자 장착 스킨" });
  assert.equal((await api("/cosmetics/equipment", "admin", "PUT", { slot: "champion:cosmetic-hero", cosmeticId: direct.body.item.id })).status, 200);
  const ordinaryBefore = (await api("/cosmetics", "player-b")).body.owned.length;
  await ensureAdminSkins("player-b");
  assert.equal((await api("/cosmetics", "player-b")).body.owned.length, ordinaryBefore);
  assert.equal((await api("/cosmetics/equipment", "player-b", "PUT", { slot: "champion:cosmetic-hero", cosmeticId: skin.id, role: "ADMIN" })).status, 403);
  const disabled = await api(prefix + "/items", "admin", "POST", { ...skin, name: "비활성 스킨", isActive: false });
  await ensureAdminSkins("admin");
  assert.ok(!(await api("/cosmetics", "admin")).body.owned.some((o: any) => o.item.id === disabled.body.item.id));
  assert.equal((await api("/cosmetics/equipment", "admin", "PUT", { slot: "champion:cosmetic-hero", cosmeticId: disabled.body.item.id })).status, 403);
  await database.update(schema.usersTable).set({ role: "USER" }).where(eq(schema.usersTable.id, "second-admin"));
  await ensureAdminSkins("second-admin");
  assert.ok(!(await database.select().from(schema.userCosmeticsTable).where(eq(schema.userCosmeticsTable.userId, "second-admin"))).some(row => row.cosmeticId === skin.id));
});

test("administrator notice deletion removes public content and rejects user/anonymous requests", async () => {
  const created = await api("/admin/notices", "admin", "POST", { title: "삭제 검증 공지", body: "관리자 삭제 테스트", displayOrder: 0, enabled: true });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.notice.id;
  assert.ok((await api("/notices", "player-a")).body.notices.some((notice: any) => notice.id === id));
  assert.equal((await api("/admin/notices/" + id, "player-a", "DELETE")).status, 403);
  assert.equal((await api("/admin/notices/" + id, "anonymous", "DELETE")).status, 401);
  assert.equal((await api("/admin/notices/" + id, "admin", "DELETE")).status, 200);
  assert.ok(!(await api("/notices", "player-a")).body.notices.some((notice: any) => notice.id === id));
  assert.equal((await api("/admin/notices/" + id, "admin", "DELETE")).status, 404);
});

test("cosmetic deletion guards packs, clears ownership/equipment atomically and retains history/images", async () => {
  await database.insert(schema.usersTable).values({ id: "delete-user", email: "delete@cosmetics.invalid", nickname: "Delete fixture", passwordHash: hash });
  const created = await api(prefix + "/items", "admin", "POST", { ...registered.CHAMPION_SKIN, name: "삭제 검증 스킨" });
  assert.equal(created.status, 201);
  const item = created.body.item;
  await api(prefix + "/users/delete-user/grants", "admin", "POST", { cosmeticId: item.id, action: "GRANT" });
  await equipCosmetic("delete-user", "champion:cosmetic-hero", item.id);
  const frozen = structuredClone(await loadCosmetics("delete-user"));
  const url = prefix + "/items/" + item.id;
  assert.equal((await api(url, "player-a", "DELETE")).status, 403);
  assert.equal((await api(url, "anonymous", "DELETE")).status, 401);
  await database.insert(schema.packDefinitionsTable).values({ id: "delete-ref-pack", name: "삭제 참조 팩", skinPool: [item.id], skinChance: 100, championRate: 100, normalRate: 0, legendaryRate: 0, championPool: ["cosmetic-hero"], status: "PUBLISHED" });
  const blocked = await api(url, "admin", "DELETE");
  assert.equal(blocked.status, 409); assert.match(blocked.body.message, /삭제 참조 팩/);
  assert.equal((await loadCosmetics("delete-user")).skins["champion:cosmetic-hero"]?.id, item.id);
  await api("/admin/packs/delete-ref-pack", "admin", "DELETE");
  assert.equal((await api(url, "admin", "DELETE")).status, 200);
  assert.equal((await loadCosmetics("delete-user")).skins["champion:cosmetic-hero"], undefined);
  assert.equal((await database.select().from(schema.userCosmeticsTable).where(eq(schema.userCosmeticsTable.cosmeticId, item.id))).length, 0);
  assert.equal((await database.select().from(schema.equippedCosmeticsTable).where(eq(schema.equippedCosmeticsTable.cosmeticId, item.id))).length, 0);
  assert.equal(frozen.skins["champion:cosmetic-hero"]!.imageAssets.art, uploaded);
  assert.equal((await fetch(origin + item.imageAssets.art)).status, 200);
  assert.equal((await database.select().from(schema.cosmeticAuditTable).where(and(eq(schema.cosmeticAuditTable.cosmeticId, item.id), eq(schema.cosmeticAuditTable.action, "DELETE")))).length, 1);
  assert.equal((await api(url, "admin", "DELETE")).status, 404);
  const [packTemplate] = await database.select().from(schema.packDefinitionsTable).where(eq(schema.packDefinitionsTable.id, "set-pack"));
  assert.equal((await api("/admin/packs", "admin", "POST", { ...packTemplate, name: "삭제 스킨 재참조 거부", skinPool: [item.id] })).status, 422);
  await api("/cosmetics", "admin");
  assert.ok(!(await api(prefix)).body.items.some((candidate: any) => candidate.id === item.id));
  for (const type of ["CARD_BACK", "IMAGE_EMOTE"]) {
    const extra = await api(prefix + "/items", "admin", "POST", { ...registered[type], name: "삭제 추가 " + type });
    assert.equal(extra.status, 201);
    assert.equal((await api(prefix + "/items/" + extra.body.item.id, "admin", "DELETE")).status, 200);
  }
  // Existing pack-card skin deletion gets the same reference guard.
  await database.insert(schema.cardSkinDefinitionsTable).values({ id: "delete-legacy-skin", cardDefinitionId: cards[0]!.id, name: "삭제 기존 스킨", status: "PUBLISHED" });
  await database.insert(schema.packDefinitionsTable).values({ id: "delete-legacy-pack", name: "기존 참조 팩", skinPool: ["delete-legacy-skin"], skinChance: 100 });
  const legacyUrl = origin + "/api/admin/card-skins/delete-legacy-skin";
  assert.equal((await fetch(legacyUrl, { method: "DELETE", headers: { cookie: cookies.admin! } })).status, 409);
  await api("/admin/packs/delete-legacy-pack", "admin", "DELETE");
  assert.equal((await fetch(legacyUrl, { method: "DELETE", headers: { cookie: cookies.admin! } })).status, 204);
});

test("admin-added deck products and quest seasons delete safely without erasing purchase/quest history", async () => {
  await database.insert(schema.shopDecksTable).values({ id: "delete-product", name: "삭제 덱 상품", price: 0, cardDefinitionIds: [] });
  assert.equal((await api("/admin/shop-decks/delete-product", "player-a", "DELETE")).status, 403);
  assert.equal((await api("/admin/shop-decks/delete-product", "admin", "DELETE")).status, 200);
  assert.equal((await api("/admin/shop-decks/delete-product", "admin", "DELETE")).status, 404);
  await database.insert(schema.shopDecksTable).values({ id: "sold-product", name: "판매된 덱 상품", price: 1, cardDefinitionIds: deck });
  await database.insert(schema.shopDeckPurchasesTable).values({ id: "retained-purchase", userId: "player-a", productId: "sold-product", deckId: "deck-player-a", price: 1, receipt: { name: "판매된 덱 상품", cardDefinitionIds: deck, championDefinitionId: "cosmetic-hero", includedChampionId: null, grantedCards: {}, balanceAfter: 0 } });
  assert.equal((await api("/admin/shop-decks/sold-product", "admin", "DELETE")).status, 409);
  assert.equal((await database.select().from(schema.shopDeckPurchasesTable).where(eq(schema.shopDeckPurchasesTable.id, "retained-purchase"))).length, 1);
  assert.equal((await database.select().from(schema.decksTable).where(eq(schema.decksTable.id, "deck-player-a"))).length, 1);
  for (const id of ["empty-quest-season", "used-quest-season"]) {
    const response = await api("/admin/quests/seasons", "admin", "POST", { id, name: id, startsAt: "2099-01-01T00:00:00Z", endsAt: "2099-02-01T00:00:00Z", status: "DISABLED" });
    assert.equal(response.status, 200, JSON.stringify(response.body));
  }
  assert.equal((await api("/admin/quests/seasons/empty-quest-season", "player-a", "DELETE")).status, 403);
  assert.equal((await api("/admin/quests/seasons/empty-quest-season", "admin", "DELETE")).status, 200);
  await database.insert(schema.dailyQuestDefinitionsTable).values({ id: "season-linked-quest", title: "연결 퀘스트", description: "", objectiveType: "PLAY_MATCH", targetValue: 1, rewardAmount: 1, enabled: false, platform: { questType: "SEASON", seasonId: "used-quest-season" } });
  assert.equal((await api("/admin/quests/seasons/used-quest-season", "admin", "DELETE")).status, 409);
  await database.insert(schema.dailyQuestAssignmentsTable).values({ id: "retained-assignment", userId: "delete-user", definitionId: "season-linked-quest", assignmentDate: "2099-01-01", slot: 0, title: "연결 퀘스트", description: "", objectiveType: "PLAY_MATCH", targetValue: 1, rewardType: "CURRENCY", rewardAmount: 1, platform: { questType: "SEASON", seasonId: "used-quest-season" } });
  await api("/admin/quests/definitions/season-linked-quest", "admin", "DELETE");
  assert.equal((await api("/admin/quests/seasons/used-quest-season", "admin", "DELETE")).status, 409);
  assert.equal((await database.select().from(schema.dailyQuestAssignmentsTable).where(eq(schema.dailyQuestAssignmentsTable.id, "retained-assignment"))).length, 1);
});

test("tower catalog deletion supports every editable resource and protects dependencies/published runs", async () => {
  const resources = { starters: schema.towerStartersTable, presets: schema.towerPresetsTable, relics: schema.towerRelicsTable, characters: schema.towerCharactersTable, scenes: schema.towerScenesTable };
  for (const [kind, table] of Object.entries(resources)) {
    const id = "delete-tower-" + kind;
    await database.insert(table).values({ id, data: { id, name: id } });
    assert.equal((await api("/admin/tower/" + kind + "/" + id, "player-a", "DELETE")).status, 403);
    assert.equal((await api("/admin/tower/" + kind + "/" + id, "admin", "DELETE")).status, 200);
    assert.equal((await api("/admin/tower/" + kind + "/" + id, "admin", "DELETE")).status, 404);
  }
  await database.insert(schema.towerMetadataTable).values({ id: cards[0]!.id, kind: "CARD", data: { synergyTags: ["삭제 테스트"] } });
  assert.equal((await api("/admin/tower/metadata/CHAMPION/" + cards[0]!.id, "admin", "DELETE")).status, 404);
  assert.equal((await api("/admin/tower/metadata/CARD/" + cards[0]!.id, "admin", "DELETE")).status, 200);
  assert.equal((await database.select().from(schema.cardsTable).where(eq(schema.cardsTable.id, cards[0]!.id))).length, 1);
  await database.insert(schema.towerRelicsTable).values({ id: "referenced-relic", data: { id: "referenced-relic", name: "연결 유물" } });
  await database.insert(schema.towerPresetsTable).values({ id: "dependent-preset", data: { id: "dependent-preset", name: "참조 덱", unlockCondition: { type: "ALL", conditions: [{ type: "RELIC", id: "referenced-relic" }] } } });
  const blocked = await api("/admin/tower/relics/referenced-relic", "admin", "DELETE");
  assert.equal(blocked.status, 409); assert.match(blocked.body.message, /참조 덱/);
  assert.equal((await api("/admin/tower/presets/dependent-preset", "admin", "DELETE")).status, 200);
  assert.equal((await api("/admin/tower/relics/referenced-relic", "admin", "DELETE")).status, 200);
  for (const id of ["delete-tower-season", "protected-tower-season"]) await database.insert(schema.towerSeasonsTable).values({ id, name: id, active: false, data: { id, name: id } });
  assert.equal((await api("/admin/tower/seasons/delete-tower-season", "admin", "DELETE")).status, 200);
  await database.insert(schema.towerVersionsTable).values({ id: "retained-version", towerId: "protected-tower-season", version: 1, snapshot: {}, publishedBy: "admin" });
  await database.insert(schema.towerRunsTable).values({ id: "retained-run", userId: "player-a", seasonId: "protected-tower-season", state: {}, snapshot: {} });
  assert.equal((await api("/admin/tower/seasons/protected-tower-season", "admin", "DELETE")).status, 409);
  assert.equal((await database.select().from(schema.towerVersionsTable).where(eq(schema.towerVersionsTable.id, "retained-version"))).length, 1);
  assert.equal((await database.select().from(schema.towerRunsTable).where(eq(schema.towerRunsTable.id, "retained-run"))).length, 1);
});

after(async () => {
  if (process.env.KO_COSMETICS_BROWSER_MODE === "1") {
    // Restore deck quantities after the missing-original acquisition tests.
    await database.update(schema.userCardCollectionsTable).set({ quantity: 3 }).where(eq(schema.userCardCollectionsTable.userId, "player-b"));
    // Start a fresh match, then use real accepted card actions to populate each board.
    if (runtime) {
      runtime.state.status = "FINISHED";
      cleanupMatchRuntime(runtime.matchId);
    }
    for (const card of cards.slice(1)) {
      const item = (
        await api(prefix + "/items", "admin", "POST", {
          ...registered.CARD_SKIN,
          name: "QA " + card.name,
          targetId: card.id,
        })
      ).body.item;
      await api(prefix + "/users/player-a/grants", "admin", "POST", {
        cosmeticId: item.id,
        action: "GRANT",
      });
      await equipCosmetic("player-a", "card:" + card.id, item.id);
    }
    runtime = await startOnlineMatch(
      "player-a",
      "deck-player-a",
      "player-b",
      "deck-player-b",
    );
    await new Promise((r) => setTimeout(r, 4700));
    for (const user of ["player-a", "player-b"]) {
      const m = await applyMatchAction(
        runtime.matchId,
        user,
        randomUUID(),
        runtime.version,
        { type: "MULLIGAN", cardInstanceIds: [] },
      );
      assert.equal(m.ok, true, m.ok ? "" : m.message);
    }
    for (let i = 0; i < 2; i++) {
      const user =
        runtime.state.activePlayerId === "PLAYER_ONE" ? "player-a" : "player-b";
      const player = runtime.state.players.find(
        (p: any) => p.id === runtime.state.activePlayerId,
      );
      const card = player.hand[0];
      const action = await applyMatchAction(
        runtime.matchId,
        user,
        randomUUID(),
        runtime.version,
        {
          type: "PLAY_WRESTLER",
          cardInstanceId: card.instanceId,
          boardSlot: i,
        },
      );
      assert.equal(action.ok, true, action.ok ? "" : action.message);
      const ended = await applyMatchAction(
        runtime.matchId,
        user,
        randomUUID(),
        runtime.version,
        { type: "END_TURN" },
      );
      assert.equal(ended.ok, true);
    }
    // Populate presentation fixture through the same direct-deployment engine helper.
    const { directDeployChampionToken } = await import("../../../artifacts/ko-game/src/game/engine/champion-token");
    const { cardRecordToDefinition } = await import("../../game-engine/src/index");
    if (!runtime.state.cardPool?.some((c: any) => c.id === "set-token")) {
      const [token] = await database.select().from(schema.cardsTable).where(eq(schema.cardsTable.id, "set-token"));
      runtime.state.cardPool = [...(runtime.state.cardPool ?? []), cardRecordToDefinition(token as any)];
    }
    for (const player of runtime.state.players) runtime.state = directDeployChampionToken(runtime.state, player.id, "cosmetic-hero", "set-token");
    await database.update(schema.packDefinitionsTable).set({ skinPool: [registered.CHAMPION_SKIN.id] }).where(eq(schema.packDefinitionsTable.id, "set-pack"));
    await database.update(schema.userPackInventoryTable).set({ quantity: 6 }).where(eq(schema.userPackInventoryTable.packDefinitionId, "set-pack"));
    await database.update(schema.userChampionCollectionsTable).set({ owned: false }).where(eq(schema.userChampionCollectionsTable.userId, "player-b"));
    await mkdir("qa-results/cosmetics", { recursive: true });
    await writeFile("qa-results/cosmetics/upload-fixture.png", png);
    await writeFile(
      "qa-results/cosmetics/fixture.json",
      JSON.stringify({
        origin,
        cookies,
        matchId: runtime.matchId,
        cards,
        championId: "cosmetic-hero",
        registered,
        password,
      }),
    );
    console.log("COSMETICS_BROWSER_READY " + origin);
    await new Promise(() => {});
  }
  if (runtime) {
    runtime.state.status = "FINISHED";
    cleanupMatchRuntime(runtime.matchId);
  }
  for (const socket of connections) socket.destroy();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
  await pg.close();
});

test("unified catalog preserves pack IDs/owners and supports legacy edit, grant, equip, revoke and guarded delete", async () => {
  const id = "unified-old-pack-skin", cosmeticId = "pack-skin:"+id;
  await database.insert(schema.cardSkinDefinitionsTable).values({id,cardDefinitionId:cards[0]!.id,name:"통합 이전 스킨",status:"PUBLISHED",imageUrl:uploaded});
  await database.insert(schema.userCardSkinCollectionsTable).values({userId:"player-b",skinDefinitionId:id});
  const catalog = (await api(prefix)).body.items;
  const item = catalog.find((i:any)=>i.id===cosmeticId);
  assert.equal(item.legacySkinId,id);
  assert.equal(catalog.filter((i:any)=>i.legacySkinId===id).length,1);
  // Existing pack ownership becomes a normal equippable skin, once, without granting originals.
  for(let n=0;n<2;n++) {
    const inventory = (await api("/cosmetics","player-b")).body.owned;
    assert.equal(inventory.filter((o:any)=>o.item.id===cosmeticId).length,1);
  }
  assert.equal((await api("/cosmetics/equipment","player-a","PUT",{slot:"card:"+cards[0]!.id,cosmeticId})).status,403);
  assert.equal((await api("/cosmetics/equipment","player-b","PUT",{slot:"card:"+cards[0]!.id,cosmeticId})).status,200);
  assert.equal(cosmeticImage(await loadCosmetics("player-b"),"CARD_SKIN",cards[0]!.id,"art","base"),uploaded);
  const edited=await api(prefix+"/items/"+cosmeticId,"admin","PATCH",{...item,name:"통합 수정 스킨",sortOrder:17});
  assert.equal(edited.status,200,JSON.stringify(edited.body));
  assert.equal(edited.body.item.sortOrder,17);
  assert.equal((await database.select().from(schema.cardSkinDefinitionsTable).where(eq(schema.cardSkinDefinitionsTable.id,id)))[0]!.name,"통합 수정 스킨");
  assert.equal((await api(prefix)).body.items.filter((i:any)=>i.id===cosmeticId).length,1);
  assert.equal((await api(prefix)).body.items.find((i:any)=>i.id===cosmeticId).sortOrder,17);
  // Historical API remains compatible and updates the same equipped presentation.
  assert.equal((await api("/admin/card-skins/"+id+"/status","admin","POST",{status:"DISABLED"})).status,200);
  assert.equal((await loadCosmetics("player-b")).skins["card:"+cards[0]!.id],undefined);
  assert.equal((await api("/cosmetics/equipment","player-b","PUT",{slot:"card:"+cards[0]!.id,cosmeticId})).status,403);
  assert.equal((await api(prefix+"/items/"+cosmeticId,"admin","PATCH",{...item,isActive:false,publicationStatus:"DRAFT"})).status,200);
  assert.equal((await api(prefix)).body.items.find((i:any)=>i.id===cosmeticId).publicationStatus,"DRAFT");
  assert.equal((await api(prefix+"/items/"+cosmeticId,"admin","PATCH",item)).status,200);
  assert.equal((await api(prefix+"/users/player-a/grants","admin","POST",{cosmeticId,action:"GRANT"})).status,200);
  assert.equal((await api(prefix+"/users/player-a/grants","admin","POST",{cosmeticId,action:"REVOKE"})).status,200);
  assert.ok(!(await api("/cosmetics","player-a")).body.owned.some((o:any)=>o.item.id===cosmeticId));
  const options=(await api("/admin/packs/options")).body.skins;
  assert.equal(options.filter((i:any)=>i.id===id).length,1);
  assert.ok(!options.some((i:any)=>i.id===cosmeticId));
  // New card skins created in the unified editor remain available to the existing pack editor.
  assert.ok(registered.CARD_SKIN.legacySkinId);
  assert.ok(options.some((i:any)=>i.id===registered.CARD_SKIN.legacySkinId));
  await database.insert(schema.packDefinitionsTable).values({id:"unified-protected-pack",name:"통합 보호 팩",skinPool:[id]});
  assert.equal((await api(prefix+"/items/"+cosmeticId,"admin","DELETE")).status,409);
  await database.delete(schema.packDefinitionsTable).where(eq(schema.packDefinitionsTable.id,"unified-protected-pack"));
  assert.equal((await api(prefix+"/items/"+cosmeticId,"admin","DELETE")).status,200);
  assert.equal((await database.select().from(schema.cardSkinDefinitionsTable).where(eq(schema.cardSkinDefinitionsTable.id,id))).length,0);
  assert.equal((await database.select().from(schema.cosmeticItemsTable).where(eq(schema.cosmeticItemsTable.id,cosmeticId))).length,0);
  assert.ok(!(await api("/cosmetics","player-b")).body.owned.some((o:any)=>o.item.id===cosmeticId));
});

test("skin display settings round-trip through modern/legacy catalog and owned loadouts, with strict bounds",async()=>{
 const {cosmeticAssetDisplay,cosmeticImageSettings}=await import("../../cosmetics/src/index");
 const display={imageDisplayMode:"CONTAIN",imageScale:1.35,imagePositionX:24,imagePositionY:72};
 const legacy=registered.CARD_SKIN;
 let patched=await api(prefix+"/items/"+legacy.id,"admin","PATCH",{...legacy,imageAssets:{...legacy.imageAssets,__display:JSON.stringify({art:display})}});
 assert.equal(patched.status,200,JSON.stringify(patched.body));
 registered.CARD_SKIN=patched.body.item;
 const [raw]=await database.select().from(schema.cardSkinDefinitionsTable).where(eq(schema.cardSkinDefinitionsTable.id,legacy.legacySkinId));
 assert.equal(raw!.imageScale,1.35);assert.equal(raw!.imagePositionX,24);assert.equal(raw!.imagePositionY,72);
 await equipCosmetic("player-a","card:"+cards[0]!.id,legacy.id);
 assert.deepEqual(cosmeticImageSettings(await loadCosmetics("player-a"),"CARD_SKIN",cards[0]!.id,"art"),display);
 const champ=registered.CHAMPION_SKIN;
 const assets={...champ.imageAssets,__display:JSON.stringify({art:display,awakened:{...display,imageScale:1.1},"token:set-token":{...display,imageScale:.8}})};
 patched=await api(prefix+"/items/"+champ.id,"admin","PATCH",{...champ,imageAssets:assets});
 assert.equal(patched.status,200,JSON.stringify(patched.body));registered.CHAMPION_SKIN=patched.body.item;
 await api(prefix+"/users/player-a/grants","admin","POST",{cosmeticId:champ.id,action:"GRANT"});
 await equipCosmetic("player-a","champion:cosmetic-hero",champ.id);
 const loadout=await loadCosmetics("player-a");
 assert.deepEqual(cosmeticImageSettings(loadout,"CHAMPION_SKIN","cosmetic-hero","intro"),display);
 assert.equal(cosmeticImageSettings(loadout,"CHAMPION_SKIN","cosmetic-hero","awakened")!.imageScale,1.1);
 assert.equal(cosmeticImageSettings(loadout,"CARD_SKIN","set-token","art")!.imageScale,.8);
 assert.equal(cosmeticAssetDisplay((await api(prefix)).body.items.find((i:any)=>i.id===champ.id).imageAssets,"art")!.imagePositionY,72);
 for(const value of ['not-json',JSON.stringify({art:{...display,imageScale:9}}),JSON.stringify({art:{...display,imagePositionX:-1}}),JSON.stringify({art:{...display,imageDisplayMode:"INVALID"}})]) {
   assert.equal((await api(prefix+"/items/"+champ.id,"admin","PATCH",{...champ,imageAssets:{...champ.imageAssets,__display:value}})).status,400);
 }
 const owned=(await api("/cosmetics","player-a")).body.owned.find((o:any)=>o.item.id===champ.id);
 assert.deepEqual(cosmeticAssetDisplay(owned.item.imageAssets,"art"),display);
});

test("image emote throttling has no per-turn quota and replaces the previous image per player",async()=>{
 const {CosmeticEmoteChannel}=await import('../../../artifacts/api-server/src/lib/cosmetic-emotes');
 const channel=new CosmeticEmoteChannel(),loadout=await loadCosmetics('player-a');
 const input={matchId:'same-turn',userId:'player-a',playerId:'PLAYER_ONE',requestId:'first',slot:1,loadout};
 assert.ok(channel.send(input,0));assert.equal(channel.send({...input,requestId:'flood'},1),null);
 for(let n=1;n<=20;n++)assert.ok(channel.send({...input,requestId:'same-turn-'+n},n*800));
 assert.equal(channel.latest(16000).length,1);assert.equal(channel.latest(18001).length,0);
 assert.equal(channel.send({...input,requestId:'same-turn-20'},20000),null);
});

// Reuse the isolated database for the existing pack transaction regression.
await import("../../../artifacts/api-server/src/routes/packs.test");

// Shared only by isolated database regression suites, never application code.
export {database,pg,api,cards,deck};
