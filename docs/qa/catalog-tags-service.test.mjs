import { resolveTriggeredAbilities } from "../../artifacts/ko-game/src/game/effects/effect-engine.ts";
/** Actual API against disposable PGlite; never a production mutation. */
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { eq, sql } from "../../lib/db/node_modules/drizzle-orm/index.js";
import { readFile } from "node:fs/promises";
import {
  createInitialGameState,
  generateCardInstance,
} from "../../lib/game-engine/src/index.ts";
let f;
before(async () => {
  f = await startTutorialFixture();
  await f.db.insert(f.schema.cardsTable).values([
    {
      id: "tag-a",
      name: "검증 선수 A",
      cardType: "WRESTLER",
      rarity: "NORMAL",
      cost: 1,
      attack: 2,
      health: 3,
      text: "검증",
      tags: ["기존 태그", "보조"],
      status: "PUBLISHED",
    },
    {
      id: "tag-b",
      name: "검증 선수 B",
      cardType: "WRESTLER",
      rarity: "EPIC",
      cost: 3,
      attack: 3,
      health: 4,
      text: "검증",
      tags: ["보조"],
      status: "DRAFT",
    },
    {
      id: "tag-spell",
      name: "선택 불가 주문",
      cardType: "TECHNIQUE",
      rarity: "NORMAL",
      cost: 1,
      attack: 0,
      health: 0,
      text: "검증",
      tags: [],
      status: "PUBLISHED",
    },
  ]);
});
after(async () => f.close());
const request = async (path = "", method = "GET", body, auth = true) =>
  fetch(f.origin + "/api/admin/tags" + path, {
    method,
    headers: {
      ...(auth ? { Cookie: f.cookie } : {}),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
test("label migration is repeatable and preserves existing tag memberships", async () => {
  const migration = await readFile(
    "lib/db/migrations/0057_card_tag_display_names.sql",
    "utf8",
  );
  await f.db.execute(sql.raw(migration));
  await f.db.execute(sql.raw(migration));
  assert.equal((await request()).status, 200);
});
test("rename persists display name and all original effect keys; collisions and missing tags reject safely", async () => {
  const r = await request("/" + encodeURIComponent("기존 태그"), "PATCH", {
    displayName: "새 이름",
  });
  assert.equal(r.status, 200, await r.clone().text());
  const loaded = await request().then((r) => r.json());
  assert.equal(loaded.labels["기존 태그"], "새 이름");
  assert.ok(loaded.tags.includes("기존 태그"));
  assert.deepEqual(loaded.cards.find((c) => c.id === "tag-a").tags, [
    "기존 태그",
    "보조",
  ]);
  assert.equal(
    (
      await request("/" + encodeURIComponent("기존 태그"), "PATCH", {
        displayName: "보조",
      })
    ).status,
    409,
  );
  assert.equal(
    (await request("/missing", "PATCH", { displayName: "없음" })).status,
    404,
  );
  assert.equal(
    (
      await request("/" + encodeURIComponent("기존 태그"), "PATCH", {
        displayName: "x".repeat(101),
      })
    ).status,
    400,
  );
  const publicData = await fetch(f.origin + "/api/card-tags").then((r) =>
    r.json(),
  );
  assert.equal(publicData.labels["기존 태그"], "새 이름");
  const unit = {
    id: "tag-qa",
    name: "검증",
    cardType: "WRESTLER",
    cost: 1,
    attack: 1,
    health: 2,
    keywords: [],
    abilities: [],
    rulesText: "",
    tags: loaded.cards.find((c) => c.id === "tag-a").tags,
  };
  const s = createInitialGameState();
  s.status = "IN_PROGRESS";
  s.players[0].hand = [];
  s.cardPool = [unit];
  s.players[0].currentGold = 1;
  s.players[0].board = [
    {
      ...generateCardInstance(unit, { instanceId: "source" }),
      boardSlot: 0,
      abilities: [
        {
          trigger: "TURN_START",
          condition: { type: "BOARD_HAS_TAG", tag: "기존 태그" },
          effects: [
            { type: "STRUCTURED", action: "ADD_GOLD", values: { amount: 1 } },
          ],
        },
      ],
    },
    { ...generateCardInstance(unit, { instanceId: "ally" }), boardSlot: 1 },
    null,
    null,
  ];
  const n = resolveTriggeredAbilities(
    s,
    "player-1",
    s.players[0].board[0],
    "TURN_START",
  );
  assert.equal(n.players[0].currentGold, 2);
});
test("bulk attach/detach is idempotent and only changes selected wrestlers, preserving other tags and versions", async () => {
  const before = await f.db
    .select()
    .from(f.schema.cardsTable)
    .where(eq(f.schema.cardsTable.id, "tag-a"));
  let r = await request(
    "/" + encodeURIComponent("기존 태그") + "/cards",
    "PATCH",
    { cardIds: ["tag-a", "tag-b", "tag-b"], attached: true },
  );
  assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual(await r.json(), { affectedCards: 1, selectedCards: 2 });
  r = await request("/" + encodeURIComponent("기존 태그") + "/cards", "PATCH", {
    cardIds: ["tag-a", "tag-b"],
    attached: true,
  });
  assert.equal((await r.json()).affectedCards, 0);
  const [same] = await f.db
    .select()
    .from(f.schema.cardsTable)
    .where(eq(f.schema.cardsTable.id, "tag-a"));
  assert.equal(same.version, before[0].version);
  r = await request("/" + encodeURIComponent("기존 태그") + "/cards", "PATCH", {
    cardIds: ["tag-b"],
    attached: false,
  });
  assert.equal((await r.json()).affectedCards, 1);
  const data = await request().then((r) => r.json());
  assert.deepEqual(data.cards.find((c) => c.id === "tag-b").tags, ["보조"]);
  assert.deepEqual(data.cards.find((c) => c.id === "tag-a").tags, [
    "기존 태그",
    "보조",
  ]);
});
test("invalid mixed bulk list fails atomically, duplicate names and unauthorized writes are rejected", async () => {
  for (const bad of ["tag-spell", "missing"]) {
    const r = await request(
      "/" + encodeURIComponent("기존 태그") + "/cards",
      "PATCH",
      { cardIds: ["tag-b", bad], attached: true },
    );
    assert.equal(r.status, 404);
    const [row] = await f.db
      .select()
      .from(f.schema.cardsTable)
      .where(eq(f.schema.cardsTable.id, "tag-b"));
    assert.deepEqual(row.tags, ["보조"]);
  }
  assert.equal(
    (
      await request("/" + encodeURIComponent("기존 태그") + "/cards", "PATCH", {
        cardIds: [],
        attached: true,
      })
    ).status,
    400,
  );
  assert.equal((await request("", "POST", { name: "새 이름" })).status, 409);
  assert.equal(
    (
      await request(
        "/" + encodeURIComponent("기존 태그"),
        "PATCH",
        { displayName: "무단" },
        false,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        "/" + encodeURIComponent("기존 태그") + "/cards",
        "PATCH",
        { cardIds: ["tag-a"], attached: false },
        false,
      )
    ).status,
    401,
  );
});
test("renaming and membership updates serialize without losing links; renamed deletion keeps other tags", async () => {
  const responses = await Promise.all([
    request("/" + encodeURIComponent("기존 태그"), "PATCH", {
      displayName: "최종 이름",
    }),
    request("/" + encodeURIComponent("기존 태그") + "/cards", "PATCH", {
      cardIds: ["tag-b"],
      attached: true,
    }),
  ]);
  assert.ok(responses.every((r) => r.status === 200));
  let data = await request().then((r) => r.json());
  assert.equal(data.labels["기존 태그"], "최종 이름");
  assert.ok(
    data.cards.find((c) => c.id === "tag-b").tags.includes("기존 태그"),
  );
  const deleted = await request(
    "/" + encodeURIComponent("기존 태그"),
    "DELETE",
  );
  assert.equal(deleted.status, 200);
  data = await request().then((r) => r.json());
  assert.ok(!data.tags.includes("기존 태그"));
  assert.deepEqual(data.cards.find((c) => c.id === "tag-a").tags, ["보조"]);
  assert.deepEqual(data.cards.find((c) => c.id === "tag-b").tags, ["보조"]);
});
