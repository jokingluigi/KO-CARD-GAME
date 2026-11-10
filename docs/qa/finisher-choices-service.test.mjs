/** Isolated PGlite and the real HTTP admin / authoritative online service. No production writes. */
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { createInitialGameState } from "../../artifacts/ko-game/src/game/engine/create-initial-game-state.ts";
import { generateCardInstance } from "../../artifacts/ko-game/src/game/cards/generation.ts";
let f, service;
const ids = [];
const unit = {
  id: "choices-source",
  name: "검증 선수",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 1,
  attack: 2,
  health: 3,
  keywords: [],
  abilities: [],
  rulesText: "",
};
const a = {
  ...unit,
  id: "choice-card-a",
  name: "테스트 피니셔 A",
  cardType: "TECHNIQUE",
  rarity: "CHAMPION",
  isChampionToken: true,
  isToken: true,
};
const b = { ...a, id: "choice-card-b", name: "테스트 피니셔 B" };
const options = [
  {
    id: "a",
    name: "선택지 A",
    description: "카드 1회 사용",
    cardDefinitionId: a.id,
    condition: {
      type: "EVENT",
      event: "CARD_PLAYED",
      owner: "SELF",
      required: 1,
    },
  },
  {
    id: "b",
    name: "선택지 B",
    description: "선수 1회 등장",
    cardDefinitionId: b.id,
    condition: {
      type: "EVENT",
      event: "ENTER_FIELD",
      owner: "SELF",
      required: 1,
    },
  },
];
before(async () => {
  f = await startTutorialFixture();
  service = await import("../../artifacts/api-server/src/online/service.ts");
  await f.db
    .insert(f.schema.usersTable)
    .values({
      id: "choices-opponent",
      email: "choices@example.invalid",
      nickname: "상대",
      passwordHash: "unusable",
      role: "USER",
    });
  await f.db.insert(f.schema.decksTable).values([
    { id: "choices-one", userId: "tutorial-user", name: "검증" },
    { id: "choices-two", userId: "choices-opponent", name: "검증" },
  ]);
});
after(async () => {
  for (const id of ids) service.cleanupMatchRuntime(id);
  await f.close();
});
async function fixture() {
  const id = "choices-match-" + ids.length;
  ids.push(id);
  const s = createInitialGameState();
  s.gameId = id;
  s.status = "IN_PROGRESS";
  s.turn = 3;
  s.activePlayerId = "PLAYER_ONE";
  s.cardPool = [unit, a, b];
  s.players = s.players.map((p, i) => ({
    ...p,
    id: i ? "PLAYER_TWO" : "PLAYER_ONE",
    hand: [],
    deck: [],
    board: [null, null, null, null],
    currentGold: 6,
    champion: {
      ...p.champion,
      quest: i
        ? null
        : {
            id: "options",
            name: "피니셔 준비",
            description: "검증",
            trackedEvent: "CARD_PLAYED",
            requiredProgress: 1,
            reward: { type: "GAIN_GOLD", amount: 99 },
            finisherChoices: options,
          },
    },
  }));
  s.players[0].hand = [generateCardInstance(unit, { instanceId: "source" })];
  await f.db.insert(f.schema.onlineMatchesTable).values({
    id,
    status: "ACTIVE",
    player1UserId: "tutorial-user",
    player2UserId: "choices-opponent",
    player1DeckId: "choices-one",
    player2DeckId: "choices-two",
    serializedGameState: s,
    serializedSnapshot: {
      player1UserId: "tutorial-user",
      player2UserId: "choices-opponent",
      player1DeckId: "choices-one",
      player2DeckId: "choices-two",
      cardDefinitions: s.cardPool,
      championDefinitions: [],
      publicPlayers: [
        { userId: "tutorial-user", nickname: "검증" },
        { userId: "choices-opponent", nickname: "상대" },
      ],
      introFirstSpeaker: null,
    },
  });
  return service.getRuntime(id);
}
const act = (r, id, payload, user = "tutorial-user", version = r.version) =>
  service.applyMatchAction(r.matchId, user, id, version, payload);
test("actual card-play resolution evaluates both independent alternatives before locking; both clients, DB reload, timeout, idempotency", async () => {
  let r = await fixture();
  let result = await act(r, "play", {
    type: "PLAY_WRESTLER",
    cardInstanceId: "source",
    boardSlot: 0,
  });
  assert.ok(result.ok, result.message);
  assert.deepEqual(r.state.targetingState?.finisherChoice?.optionIds, [
    "a",
    "b",
  ]);
  assert.equal(r.state.players[0].champion.questCompleted, false);
  const own = service.snapshotMessage(r, "tutorial-user"),
    other = service.snapshotMessage(r, "choices-opponent");
  assert.equal(own.state.targetingState.validTargetIds.length, 2);
  assert.equal(other.state.targetingState, undefined);
  assert.equal(other.state.waitingForFinisherPlayerId, "PLAYER_ONE");
  assert.equal(
    (await act(r, "cancel", { type: "CANCEL_EFFECT_TARGET" })).ok,
    false,
  );
  assert.equal(
    (
      await act(r, "forged", {
        type: "SELECT_EFFECT_TARGET",
        targetId: "finisher:invalid",
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await act(
        r,
        "enemy",
        { type: "SELECT_EFFECT_TARGET", targetId: "finisher:b" },
        "choices-opponent",
      )
    ).ok,
    false,
  );
  const id = r.matchId;
  service.cleanupMatchRuntime(id);
  r = await service.getRuntime(id);
  assert.deepEqual(r.state.targetingState.finisherChoice.optionIds, ["a", "b"]);
  r.turnDeadlineAt = Date.now() - 1;
  const version = r.version;
  result = await act(r, "choice", {
    type: "SELECT_EFFECT_TARGET",
    targetId: "finisher:b",
  });
  assert.ok(result.ok, result.message);
  assert.equal(r.state.players[0].champion.selectedFinisherId, "b");
  assert.equal(r.state.players[0].hand.length, 1);
  assert.equal(r.state.players[0].hand[0].definitionId, b.id);
  assert.equal(r.state.players[0].currentGold, 5);
  assert.equal(
    r.state.events.filter((e) => e.type === "CHAMPION_QUEST_COMPLETED").length,
    1,
  );
  const duplicate = await act(
    r,
    "choice",
    { type: "SELECT_EFFECT_TARGET", targetId: "finisher:b" },
    "tutorial-user",
    version,
  );
  assert.ok(duplicate.ok && duplicate.duplicate);
  assert.equal(r.state.players[0].hand.length, 1);
  assert.equal(
    service.snapshotMessage(r, "choices-opponent").state
      .waitingForFinisherPlayerId,
    undefined,
  );
  service.cleanupMatchRuntime(id);
  r = await service.getRuntime(id);
  assert.equal(r.state.players[0].champion.selectedFinisherId, "b");
  assert.equal(r.state.players[0].hand.length, 1);
});
test("real admin API saves/reloads options in existing JSON column, validates references and supports updates", async () => {
  for (const card of [a, b])
    await f.db
      .insert(f.schema.cardsTable)
      .values({
        id: card.id,
        name: card.name,
        cardType: card.cardType,
        rarity: card.rarity,
        cost: card.cost,
        attack: 0,
        health: 0,
        text: "검증용",
        keywords: [],
        isChampionToken: true,
        isToken: true,
        status: "DRAFT",
      });
  const body = {
    name: "피니셔 검증 챔피언",
    description: "검증용",
    maxHealth: 20,
    abilityName: "기본 능력",
    abilityCost: 1,
    abilityText: "",
    abilityEffects: {},
    hasQuest: true,
    questName: "피니셔 준비",
    questText: "선택지",
    questProgressRequired: 1,
    questCondition: {
      event: "CARD_PLAYED",
      required: 1,
      finisherChoices: options,
    },
  };
  const headers = { Cookie: f.cookie, "Content-Type": "application/json" };
  const save = await fetch(f.origin + "/api/admin/champions", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  assert.equal(save.status, 201, await save.clone().text());
  const { champion } = await save.json();
  assert.deepEqual(champion.questCondition.finisherChoices, options);
  const load = await fetch(f.origin + "/api/admin/champions", { headers });
  const data = await load.json();
  assert.deepEqual(
    data.champions.find((c) => c.id === champion.id).questCondition
      .finisherChoices,
    options,
  );
  const updated = structuredClone(options);
  updated[0].condition.required = 2;
  const patch = await fetch(f.origin + "/api/admin/champions/" + champion.id, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      version: champion.version,
      questCondition: { ...body.questCondition, finisherChoices: updated },
    }),
  });
  assert.equal(patch.status, 200, await patch.clone().text());
  assert.equal(
    (await patch.json()).champion.questCondition.finisherChoices[0].condition
      .required,
    2,
  );
  const bad = structuredClone(body);
  bad.questCondition.finisherChoices[0].cardDefinitionId = "nonexistent";
  assert.equal(
    (
      await fetch(f.origin + "/api/admin/champions", {
        method: "POST",
        headers,
        body: JSON.stringify(bad),
      })
    ).status,
    400,
  );
});
