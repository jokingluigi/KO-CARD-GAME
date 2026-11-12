import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import {
  cardRecordToDefinition,
  createInitialGameState,
  generateCardInstance,
  enterField,
  executeAction,
  isTokenCard,
} from "../../lib/game-engine/src/index.ts";
import { getRandomCardGenerationCandidates } from "../../artifacts/ko-game/src/game/cards/generation.ts";
import { getValidTargets } from "../../artifacts/ko-game/src/game/effects/effect-engine.ts";
const records = JSON.parse(
  readFileSync(
    "docs/qa/20261112-token-classification/public-fixture-before.json",
  ),
);
const guild = cardRecordToDefinition(
  records.find((c) => c.name === "길드 접수원"),
);
const rawWolf = records.find((c) => c.name === "늑대인간 판도라");
const wolf = cardRecordToDefinition(rawWolf);
const normal = {
  ...guild,
  id: "token-test-normal",
  name: "일반 후보",
  abilities: [],
  cost: 1,
  attack: 1,
  health: 3,
};
test("actual grade-only wolf is a token and STANDARD excludes stale false-checkbox snapshots, FULL includes it", () => {
  assert.equal(rawWolf.rarity, "TOKEN");
  assert.equal(rawWolf.isToken, false);
  assert.equal(isTokenCard(rawWolf), true);
  assert.equal(wolf.isToken, true);
  assert.equal(wolf.cost, rawWolf.cost);
  assert.equal(wolf.attack, rawWolf.attack);
  assert.equal(wolf.health, rawWolf.health);
  const stale = { ...wolf, isToken: false };
  assert.deepEqual(
    getRandomCardGenerationCandidates([normal, stale]).map((c) => c.id),
    [normal.id],
  );
  assert.deepEqual(
    getRandomCardGenerationCandidates([normal, stale], {
      randomScope: "FULL",
    }).map((c) => c.id),
    [normal.id, wolf.id],
  );
});
test("actual Guild Receptionist ENTER_FIELD never creates grade-only wolf across seeded serialized battles", () => {
  assert.equal(guild.abilities[0].effects[0].target.randomScope, "STANDARD");
  for (let seed = 0; seed < 100; seed++) {
    const stale = { ...wolf, isToken: false };
    let s = createInitialGameState(undefined, [normal, stale, guild]);
    s.randomSeed = seed;
    s.status = "IN_PROGRESS";
    s.activePlayerId = s.players[0].id;
    for (const p of s.players) {
      p.hand = [];
      p.board = [null, null, null, null];
    }
    s = enterField(
      JSON.parse(JSON.stringify(s)),
      s.players[0].id,
      generateCardInstance(guild, { instanceId: "guild-" + seed }),
      0,
    );
    assert.equal(s.players[0].hand.length, 1);
    assert.notEqual(s.players[0].hand[0].definitionId, wolf.id);
  }
});
test("existing token on field remains a valid ordinary random effect target", () => {
  const s = createInitialGameState(undefined, [normal, wolf]);
  for (const p of s.players) p.board = [null, null, null, null];
  const target = {
    ...generateCardInstance(wolf, { instanceId: "field-wolf" }),
    boardSlot: 0,
  };
  s.players[1].board[0] = target;
  for (const scope of ["STANDARD", "FULL"])
    assert.deepEqual(
      getValidTargets(
        s,
        s.players[0].id,
        generateCardInstance(normal, { instanceId: "source" }),
        {
          type: "STRUCTURED",
          action: "DAMAGE",
          target: {
            zone: "BOARD",
            owner: "ENEMY",
            selection: "RANDOM",
            count: 1,
            randomScope: scope,
          },
          values: { amount: 1 },
        },
      ),
      ["field-wolf"],
    );
});
let f;
const wolfId = rawWolf.id;
const deckIds = Array.from({ length: 8 }, (_, i) =>
  Array(3).fill("deck-normal-" + i),
)
  .flat()
  .concat(wolfId);
before(async () => {
  f = await startTutorialFixture();
  await f.db
    .insert(f.schema.cardsTable)
    .values([
      {
        ...rawWolf,
        createdAt: undefined,
        updatedAt: undefined,
        isToken: false,
      },
      ...Array.from({ length: 9 }, (_, i) => ({
        id: "deck-normal-" + i,
        name: "정상 선수 " + i,
        cardType: "WRESTLER",
        rarity: "NORMAL",
        status: "PUBLISHED",
        cost: 1,
        attack: 1,
        health: 2,
        text: "",
      })),
    ]);
  await f.db
    .insert(f.schema.userCardCollectionsTable)
    .values([
      { userId: "tutorial-user", cardDefinitionId: wolfId, quantity: 1 },
      ...Array.from({ length: 9 }, (_, i) => ({
        userId: "tutorial-user",
        cardDefinitionId: "deck-normal-" + i,
        quantity: 3,
      })),
    ]);
  await f.db
    .insert(f.schema.decksTable)
    .values({
      id: "legacy-token-deck",
      userId: "tutorial-user",
      name: "과거 토큰 덱",
      championDefinitionId: "reward-champion",
      cardDefinitionIds: deckIds,
    });
});
after(async () => {
  await f?.close();
});
async function req(path, method = "GET", body) {
  const r = await fetch(f.origin + "/api/" + path, {
    method,
    headers: { Cookie: f.cookie, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json() };
}
test("real collection and deck options hide owned grade-only token; old deck invalid; forged save and selection rejected", async () => {
  for (const path of ["collection", "decks/options"]) {
    const r = await req(path);
    assert.equal(r.status, 200);
    assert.ok(!r.body.cards.some((c) => c.id === wolfId), path);
    assert.ok(r.body.cards.some((c) => c.id === "deck-normal-0"));
    if (r.body.craftableCards)
      assert.ok(!r.body.craftableCards.some((c) => c.id === wolfId));
  }
  const list = await req("decks");
  const old = list.body.decks.find((d) => d.id === "legacy-token-deck");
  assert.equal(old.isValid, false);
  assert.ok(
    old.validationReasons.some(
      (r) =>
        r.reasonCode === "TOKEN_CARD_NOT_ALLOWED" &&
        r.cardDefinitionIds.includes(wolfId),
    ),
  );
  const save = await req("decks", "POST", {
    name: "잘못된 신규 덱",
    championDefinitionId: "reward-champion",
    cardDefinitionIds: deckIds,
  });
  assert.equal(save.status, 400);
  assert.match(save.body.message, /일반 카드/);
  assert.equal(
    (await req("decks/legacy-token-deck/select", "POST")).status,
    400,
  );
  const good = await req("decks", "POST", {
    name: "정상 덱",
    championDefinitionId: "reward-champion",
    cardDefinitionIds: [...deckIds.slice(0, -1), "deck-normal-8"],
  });
  assert.equal(good.status, 201);
  assert.equal(good.body.deck.isValid, true);
});
test("admin save normalizes TOKEN-grade checkbox and AI decks reject old grade-only token", async () => {
  const { validateAIDeckReferences } =
    await import("../../artifacts/api-server/src/lib/ai-deck-service.ts");
  const result = await validateAIDeckReferences("reward-champion", deckIds);
  assert.equal(result.isValid, false);
  const { parseCardInput } =
    await import("../../artifacts/api-server/src/routes/admin.ts");
  assert.equal(parseCardInput(rawWolf).isToken, true);
  const update = await req("admin/cards/" + wolfId, "PATCH", rawWolf);
  assert.equal(update.status, 200);
  assert.equal(update.body.card.isToken, true);
  assert.equal(update.body.card.text, rawWolf.text);
  assert.equal(update.body.card.attack, rawWolf.attack);
});
