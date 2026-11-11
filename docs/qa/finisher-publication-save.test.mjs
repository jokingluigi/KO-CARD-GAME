/** Published champion + new draft finisher reproduction using real HTTP and isolated DB. */
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { eq } from "../../lib/db/node_modules/drizzle-orm/index.js";
let f,
  counter = 0;
before(async () => {
  f = await startTutorialFixture();
});
after(async () => {
  await f.close();
});
async function fixture(n = 1) {
  const id = "publish-link-" + counter++;
  const cardIds = Array.from({ length: n }, (_, i) => id + "-spell-" + i);
  await f.db
    .insert(f.schema.cardsTable)
    .values(
      cardIds.map((cardId, i) => ({
        id: cardId,
        name: "새 피니셔 " + i,
        cardType: "TECHNIQUE",
        rarity: "CHAMPION",
        isToken: true,
        isChampionToken: true,
        cost: 6,
        attack: 0,
        health: 0,
        text: "격리 검증 주문",
        effectId: "STRUCTURED_EFFECTS_V1",
        effectConfig: { effects: [] },
        status: "DRAFT",
      })),
    );
  await f.db
    .insert(f.schema.championsTable)
    .values({
      id,
      name: "기존 공개 챔피언 " + id,
      status: "PUBLISHED",
      abilityName: "기본",
      abilityEffects: { effects: [] },
      hasQuest: true,
      questName: "준비",
      questText: "카드 2장 사용",
      questProgressRequired: 2,
      questCondition: { event: "CARD_PLAYED", required: 2 },
      version: 1,
    });
  const q = {
    event: "CARD_PLAYED",
    required: 2,
    ...(n === 1
      ? { finisher: { cardDefinitionId: cardIds[0], delivery: "HAND" } }
      : {
          finisherChoices: cardIds.map((id, i) => ({
            id: "option-" + i,
            name: "선택지 " + i,
            description: "검증",
            condition: { type: "TURN", turn: i + 2 },
            cardDefinitionId: id,
            delivery: i ? "CAST" : "HAND",
          })),
        }),
  };
  return { id, cardIds, q };
}
const patch = (x, extra = {}) =>
  fetch(f.origin + "/api/admin/champions/" + x.id, {
    method: "PATCH",
    headers: { Cookie: f.cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ version: 1, questCondition: x.q, ...extra }),
  });
const readCard = async (id) =>
  (
    await f.db
      .select()
      .from(f.schema.cardsTable)
      .where(eq(f.schema.cardsTable.id, id))
  )[0];
const readChampion = async (id) =>
  (
    await f.db
      .select()
      .from(f.schema.championsTable)
      .where(eq(f.schema.championsTable.id, id))
  )[0];
test("reproduce existing published champion with new unpublished finisher, then explicitly publish and save once", async () => {
  const x = await fixture();
  let res = await patch(x);
  assert.equal(res.status, 422);
  const review = await res.json();
  assert.equal(review.code, "FINISHER_PUBLICATION_REQUIRED");
  assert.equal(review.cards[0].id, x.cardIds[0]);
  assert.equal((await readCard(x.cardIds[0])).status, "DRAFT");
  assert.equal((await readChampion(x.id)).version, 1);
  res = await patch(x, {
    publishFinisherCards: review.cards.map(({ id, version }) => ({
      id,
      version,
    })),
  });
  assert.equal(res.status, 200, await res.clone().text());
  const c = await readCard(x.cardIds[0]),
    champ = await readChampion(x.id);
  assert.equal(c.status, "PUBLISHED");
  assert.equal(c.version, 2);
  assert.equal(champ.version, 2);
  assert.deepEqual(champ.questCondition, x.q);
  assert.equal(champ.status, "PUBLISHED");
  assert.equal(champ.abilityName, "기본");
  assert.equal(
    (await patch(x, { publishFinisherCards: [{ id: c.id, version: 1 }] }))
      .status,
    409,
  );
  assert.equal((await readCard(c.id)).version, 2);
});
test("multiple alternative finishers are published and linked atomically with independent delivery", async () => {
  const x = await fixture(2);
  const res = await patch(x, {
    publishFinisherCards: x.cardIds.map((id) => ({ id, version: 1 })),
  });
  assert.equal(res.status, 200, await res.text());
  for (const id of x.cardIds)
    assert.equal((await readCard(id)).status, "PUBLISHED");
  assert.deepEqual(
    (await readChampion(x.id)).questCondition.finisherChoices.map(
      (o) => o.delivery,
    ),
    ["HAND", "CAST"],
  );
});
test("stale card version rolls back champion changes and every requested publication", async () => {
  const x = await fixture(2);
  await f.db
    .update(f.schema.cardsTable)
    .set({ version: 2 })
    .where(eq(f.schema.cardsTable.id, x.cardIds[1]));
  const res = await patch(x, {
    description: "이 내용도 실패해야 함",
    publishFinisherCards: x.cardIds.map((id) => ({ id, version: 1 })),
  });
  assert.equal(res.status, 409);
  assert.equal((await readChampion(x.id)).version, 1);
  assert.notEqual(
    (await readChampion(x.id)).description,
    "이 내용도 실패해야 함",
  );
  for (const id of x.cardIds)
    assert.equal((await readCard(id)).status, "DRAFT");
});
test("unpublished nested reference blocks publication and rolls back champion changes", async () => {
  const x = await fixture(2);
  await f.db
    .update(f.schema.cardsTable)
    .set({
      effectConfig: {
        effects: [
          {
            trigger: "ACTIVE",
            action: "GENERATE",
            values: { definitionRef: { id: x.cardIds[1] }, count: 1 },
          },
        ],
      },
    })
    .where(eq(f.schema.cardsTable.id, x.cardIds[0]));
  x.q = {
    event: "CARD_PLAYED",
    required: 2,
    finisher: { cardDefinitionId: x.cardIds[0], delivery: "CAST" },
  };
  const res = await patch(x, {
    publishFinisherCards: [{ id: x.cardIds[0], version: 1 }],
  });
  assert.equal(res.status, 422, await res.clone().text());
  assert.match((await res.json()).message, /참조 카드/);
  assert.equal((await readChampion(x.id)).version, 1);
  assert.equal((await readCard(x.cardIds[0])).status, "DRAFT");
});
test("unrelated publication consent and disabled/incorrect cards remain rejected", async () => {
  const x = await fixture();
  assert.equal(
    (
      await patch(x, {
        publishFinisherCards: [{ id: "reward-unit", version: 1 }],
      })
    ).status,
    400,
  );
  await f.db
    .update(f.schema.cardsTable)
    .set({ status: "DISABLED" })
    .where(eq(f.schema.cardsTable.id, x.cardIds[0]));
  const disabled = await patch(x);
  assert.equal(disabled.status, 400);
  assert.match((await disabled.json()).message, /비활성화/);
  await f.db
    .update(f.schema.cardsTable)
    .set({ status: "DRAFT", rarity: "NORMAL" })
    .where(eq(f.schema.cardsTable.id, x.cardIds[0]));
  const wrong = await patch(x, {
    publishFinisherCards: [{ id: x.cardIds[0], version: 1 }],
  });
  assert.equal(wrong.status, 400);
  assert.match(
    (await wrong.json()).message,
    /챔피언 등급 토큰 주문이 아닙니다/,
  );
  assert.equal((await readChampion(x.id)).version, 1);
});
test("already published finisher saves without consent; draft champion remains draft without publishing cards", async () => {
  const x = await fixture();
  await f.db
    .update(f.schema.cardsTable)
    .set({ status: "PUBLISHED" })
    .where(eq(f.schema.cardsTable.id, x.cardIds[0]));
  assert.equal((await patch(x)).status, 200);
  const draft = await fixture();
  await f.db
    .update(f.schema.championsTable)
    .set({ status: "DRAFT" })
    .where(eq(f.schema.championsTable.id, draft.id));
  assert.equal((await patch(draft)).status, 200);
  assert.equal((await readCard(draft.cardIds[0])).status, "DRAFT");
  assert.equal((await readChampion(draft.id)).status, "DRAFT");
});
