import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { sql, eq } from "../../lib/db/node_modules/drizzle-orm/index.js";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { cardRecordToDefinition } from "../../lib/game-engine/src/index.ts";
let f;
const payload = {
  name: "소개 검증",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 1,
  attack: 2,
  health: 3,
  text: "기존 효과 설명",
  keywords: [],
  tags: [],
  isToken: false,
  isChampionToken: false,
  isStarterGrant: false,
  effectId: null,
  effectConfig: {},
};
const lore =
  "먼 옛날의 기록.\n\n등장: 모든 상대 선수를 파괴합니다.\n<script>window.loreExecuted=true</script>";
before(async () => {
  f = await startTutorialFixture();
  await f.db.execute(sql`ALTER TABLE cards DROP COLUMN lore`);
  const ddl = readFileSync("lib/db/migrations/0059_card_lore.sql", "utf8");
  await f.db.execute(sql.raw(ddl));
  await f.db.execute(sql.raw(ddl));
});
after(async () => {
  await f?.close();
});
async function request(path, method = "GET", body) {
  const r = await fetch(f.origin + "/api/" + path, {
    method,
    headers: { Cookie: f.cookie, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json() };
}
test("additive idempotent migration gives existing cards an empty introduction", async () => {
  const [card] = await f.db
    .select()
    .from(f.schema.cardsTable)
    .where(eq(f.schema.cardsTable.id, "reward-unit"));
  assert.equal(card.lore, "");
});
test("admin creates, reloads, updates and clears lore; older clients preserve saved introduction", async () => {
  let r = await request("admin/cards", "POST", { ...payload, lore });
  assert.equal(r.status, 201);
  const id = r.body.card.id;
  assert.equal(r.body.card.lore, lore);
  assert.equal(r.body.card.text, payload.text);
  r = await request("admin/cards?search=" + encodeURIComponent(payload.name));
  assert.equal(r.body.cards.find((c) => c.id === id).lore, lore);
  r = await request("admin/cards/" + id, "PATCH", {
    ...payload,
    name: "옛 편집기로 이름 수정",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.card.lore, lore);
  r = await request("admin/cards/" + id, "PATCH", {
    ...payload,
    lore: "새 소개\n둘째 줄",
  });
  assert.equal(r.body.card.lore, "새 소개\n둘째 줄");
  r = await request("admin/cards/" + id, "PATCH", { ...payload, lore: "" });
  assert.equal(r.body.card.lore, "");
});
test("lore validation rejects non-text and oversize; exact limit accepted", async () => {
  for (const value of [null, {}, "x".repeat(5001)])
    assert.equal(
      (await request("admin/cards", "POST", { ...payload, lore: value }))
        .status,
      400,
    );
  const r = await request("admin/cards", "POST", {
    ...payload,
    lore: "x".repeat(5000),
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.card.lore.length, 5000);
});
test("public/collection/deck options deliver saved lore while engine effects stay unchanged", async () => {
  const r = await request("admin/cards/reward-unit", "PATCH", {
    ...payload,
    name: "공개 소개 카드",
    lore,
  });
  assert.equal(r.status, 200);
  const publicCards = await request("cards");
  assert.equal(
    publicCards.body.cards.find((c) => c.id === "reward-unit").lore,
    lore,
  );
  for (const path of ["collection", "decks/options"])
    assert.equal(
      (await request(path)).body.cards.find((c) => c.id === "reward-unit").lore,
      lore,
    );
  const record = (
    await request("admin/cards?search=" + encodeURIComponent("공개 소개 카드"))
  ).body.cards.find((c) => c.id === "reward-unit");
  const withLore = cardRecordToDefinition(record),
    without = cardRecordToDefinition({ ...record, lore: "" });
  assert.equal(withLore.lore, lore);
  assert.deepEqual(withLore.abilities, without.abilities);
  assert.equal(withLore.rulesText, payload.text);
});
