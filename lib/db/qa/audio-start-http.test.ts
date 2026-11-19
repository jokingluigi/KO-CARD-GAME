import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { eq } from "drizzle-orm";
import * as schema from "../src/schema";
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
const { hashPassword } =
  await import("../../../artifacts/api-server/src/lib/auth");
const password = "LocalMusic12345";
await database.insert(schema.usersTable).values([
  {
    id: "music-admin",
    email: "admin@music.invalid",
    nickname: "Music Admin",
    role: "ADMIN",
    passwordHash: await hashPassword(password),
  },
  {
    id: "music-user",
    email: "user@music.invalid",
    nickname: "Music User",
    role: "USER",
    passwordHash: await hashPassword(password),
  },
]);
const rows = [
  ["win1", "VICTORY_BGM", true],
  ["win2", "VICTORY_BGM", false],
  ["loss1", "DEFEAT_BGM", true],
  ["loss2", "DEFEAT_BGM", false],
  ["match", "BGM", true],
] as const;
await database
  .insert(schema.gameMediaTable)
  .values(
    rows.map(([id, mediaType, gameEnabled]) => ({
      id,
      mediaType,
      name: id,
      assetId: "/objects/uploads/game-bgm/" + id + ".mp3",
      assetUrl: "/api/storage/objects/uploads/game-bgm/" + id + ".mp3",
      fileName: id + ".mp3",
      contentType: "audio/mpeg",
      volume: 75,
      gameEnabled,
      enabled: gameEnabled,
    })),
  );
const { default: app } = await import("../../../artifacts/api-server/src/app");
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.on("listening", r));
const addr = server.address();
assert.ok(addr && typeof addr === "object");
const base = "http://127.0.0.1:" + addr.port + "/api";
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
  await pg.close();
});
function client() {
  let cookie = "";
  return async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch(base + path, {
      method,
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie")!.split(";")[0]!;
    return { status: r.status, body: await r.json() };
  };
}
const admin = client(),
  user = client(),
  guest = client();

test("only administrators can save offsets; media round trips through game and title catalogs", async () => {
  assert.equal(
    (await guest("/admin/game-media/match", "PATCH", { startSeconds: 12.5 }))
      .status,
    401,
  );
  assert.equal(
    (
      await admin("/auth/login", "POST", {
        email: "admin@music.invalid",
        password,
      })
    ).status,
    200,
  );
  let r = await admin("/admin/game-media/match", "PATCH", {
    startSeconds: 12.5,
    titleEnabled: true,
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.media.assetUrl.endsWith("#t=12.5"));
  assert.equal(r.body.media.volume, 75);
  r = await guest("/game-media");
  assert.ok(
    r.body.media
      .find((m: any) => m.id === "match")
      .assetUrl.endsWith("#t=12.5"),
  );
  r = await guest("/main-content");
  assert.ok(r.body.bgm.assetUrl.endsWith("#t=12.5"));
  r = await admin("/admin/game-media/match", "PATCH", { name: "Renamed" });
  assert.ok(r.body.media.assetUrl.endsWith("#t=12.5"));
  for (const startSeconds of [-1, 86401, "12", null])
    assert.equal(
      (await admin("/admin/game-media/match", "PATCH", { startSeconds }))
        .status,
      400,
    );
  r = await admin("/admin/game-media/match", "PATCH", { startSeconds: 0 });
  assert.equal(r.status, 200);
  assert.ok(!r.body.media.assetUrl.includes("#"));
});
test("card entrance offsets save without altering stats, publication state, or asset identity", async () => {
  await database
    .insert(schema.cardsTable)
    .values({
      id: "offset-card",
      name: "Offset card",
      text: "",
      cardType: "WRESTLER",
      rarity: "NORMAL",
      cost: 1,
      attack: 2,
      health: 3,
      isToken: false,
      isChampionToken: false,
      keywords: [],
      effectConfig: {},
      status: "DRAFT",
      entranceAudioAssetId: "/objects/uploads/audio/offset-card.mp3",
      entranceAudioUrl: "/api/storage/objects/uploads/audio/offset-card.mp3",
      entranceAudioEnabled: true,
    });
  let card = (await admin("/admin/cards")).body.cards.find(
    (c: any) => c.id === "offset-card",
  );
  let r = await admin("/admin/cards/offset-card", "PATCH", {
    ...card,
    entranceAudioUrl: card.entranceAudioUrl + "#t=7.25",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.card.entranceAudioUrl, card.entranceAudioUrl + "#t=7.25");
  assert.equal(r.body.card.entranceAudioAssetId, card.entranceAudioAssetId);
  assert.equal(r.body.card.status, "DRAFT");
  assert.deepEqual(
    [r.body.card.cost, r.body.card.attack, r.body.card.health],
    [1, 2, 3],
  );
  card = r.body.card;
  r = await admin("/admin/cards/offset-card", "PATCH", {
    ...card,
    entranceAudioUrl: "/api/storage/objects/uploads/audio/offset-card.mp3#t=-2",
  });
  assert.equal(r.status, 400);
});
test("champion completion music offset survives canonical asset URL reconstruction", async () => {
  await database
    .insert(schema.championsTable)
    .values({
      id: "offset-champion",
      name: "Offset champion",
      maxHealth: 20,
      abilityName: "Test",
      abilityText: "Test",
      abilityCost: 1,
      abilityEffects: {},
      status: "DRAFT",
      questCompleteAudioAssetId: "/objects/uploads/audio/offset-champion.mp3",
      questCompleteAudioUrl:
        "/api/storage/objects/uploads/audio/offset-champion.mp3",
      questCompleteAudioEnabled: true,
    });
  const champion = (await admin("/admin/champions")).body.champions.find(
    (c: any) => c.id === "offset-champion",
  );
  const r = await admin("/admin/champions/offset-champion", "PATCH", {
    ...champion,
    questCompleteAudioUrl: champion.questCompleteAudioUrl + "#t=9.5",
  });
  assert.equal(r.status, 200);
  assert.equal(
    r.body.champion.questCompleteAudioUrl,
    champion.questCompleteAudioUrl + "#t=9.5",
  );
  assert.equal(r.body.champion.status, "DRAFT");
});
