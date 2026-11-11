/** Actual PvP service and persistence; disposable PostgreSQL-compatible DB only. */
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { createInitialGameState } from "../../artifacts/ko-game/src/game/engine/create-initial-game-state.ts";
import { MAX_HAND_SIZE } from "../../artifacts/ko-game/src/game/rules/constants.ts";
import { generateCardInstance } from "../../artifacts/ko-game/src/game/cards/generation.ts";
let f, service;
import { readFileSync } from "node:fs";
import { cardRecordToDefinition } from "../../artifacts/ko-game/src/game/cards/published-cards.ts";
import { championRecordToDefinition } from "../../artifacts/ko-game/src/game/champions/published-champions.ts";
const cards = JSON.parse(
  readFileSync("docs/qa/snapshots/20261111-admin/cards.json"),
).map(cardRecordToDefinition);
const champions = JSON.parse(
  readFileSync("docs/qa/snapshots/20261111-admin/champions.json"),
).map(championRecordToDefinition);
const ids = [];
const unit = {
  id: "delivery-unit",
  name: "격리 선수",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 2,
  attack: 2,
  health: 3,
  keywords: [],
  rulesText: "",
  abilities: [],
};
const spell = {
  ...unit,
  id: "delivery-spell",
  name: "격리 피니셔",
  cardType: "TECHNIQUE",
  rarity: "CHAMPION",
  isToken: true,
  isChampionToken: true,
  cost: 6,
  abilities: [
    {
      trigger: "ACTIVE",
      effects: [
        {
          type: "STRUCTURED",
          action: "BUFF",
          target: {
            zone: "BOARD",
            owner: "SELF",
            selection: "PLAYER_CHOICE",
            count: 1,
          },
          values: { attack: 2, health: 2 },
        },
      ],
    },
  ],
};
before(async () => {
  f = await startTutorialFixture();
  service = await import("../../artifacts/api-server/src/online/service.ts");
  await f.db.insert(f.schema.usersTable).values({
    id: "delivery-opponent",
    email: "delivery@example.invalid",
    nickname: "상대",
    passwordHash: "unusable",
    role: "USER",
  });
  await f.db.insert(f.schema.decksTable).values([
    { id: "delivery-one", userId: "tutorial-user", name: "격리" },
    { id: "delivery-two", userId: "delivery-opponent", name: "격리" },
  ]);
});
after(async () => {
  for (const id of ids) service.cleanupMatchRuntime(id);
  await f.close();
});
async function fixture(mode = "CAST", full = false) {
  const id = "finisher-delivery-" + ids.length;
  ids.push(id);
  const s = createInitialGameState();
  s.gameId = id;
  s.status = "IN_PROGRESS";
  s.turn = 3;
  s.activePlayerId = "PLAYER_ONE";
  s.cardPool = [unit, spell];
  s.openingMulligan = undefined;
  s.events = [];
  s.players = s.players.map((p, i) => ({
    ...p,
    id: i ? "PLAYER_TWO" : "PLAYER_ONE",
    currentGold: 4,
    deck: [],
    hand: [],
    board: [null, null, null, null],
    champion: {
      ...p.champion,
      quest: null,
      questCompleted: false,
      questProgress: 0,
      championTokenDefinitionId: null,
    },
  }));
  s.players[0].champion.quest = {
    id: "delivery-q",
    name: "준비",
    description: "카드 1장 사용",
    trackedEvent: "CARD_PLAYED",
    requiredProgress: 1,
    finisher: { cardDefinitionId: spell.id, delivery: mode },
    reward: { type: "GAIN_GOLD", amount: 0 },
  };
  s.players[0].hand = [
    generateCardInstance(
      full
        ? {
            ...unit,
            abilities: [
              {
                trigger: "ENTER_FIELD",
                effects: [
                  {
                    type: "STRUCTURED",
                    action: "GENERATE",
                    values: { definitionRef: { id: unit.id }, count: 1 },
                  },
                ],
              },
            ],
          }
        : unit,
      { instanceId: "source" },
    ),
    ...(full
      ? Array.from({ length: MAX_HAND_SIZE - 1 }, (_, i) =>
          generateCardInstance(unit, { instanceId: "old-" + i }),
        )
      : []),
  ];
  s.cardPool = [...cards, unit];
  if (mode === "PANDORA") {
    const c = champions.find((c) => c.name === "챔피언 판도라");
    s.players[0].champion = {
      ...c,
      health: 10,
      questCompleted: false,
      questProgress: 0,
    };
    s.players[0].health = 10;
    s.players[0].hand = [];
    s.players[1].board = [0, 1]
      .map((i) => ({
        ...generateCardInstance(
          { ...unit, health: 1 },
          { instanceId: "enemy-" + i },
        ),
        boardSlot: i,
      }))
      .concat([null, null]);
  } else {
    s.players[0].hand = [
      generateCardInstance(
        cards.find((c) => c.name === "흉내내기"),
        { instanceId: "mimic" },
      ),
    ];
    s.players[0].currentGold = 6;
  }
  await f.db.insert(f.schema.onlineMatchesTable).values({
    id,
    status: "ACTIVE",
    player1UserId: "tutorial-user",
    player2UserId: "delivery-opponent",
    player1DeckId: "delivery-one",
    player2DeckId: "delivery-two",
    serializedGameState: s,
    serializedSnapshot: {
      player1UserId: "tutorial-user",
      player2UserId: "delivery-opponent",
      player1DeckId: "delivery-one",
      player2DeckId: "delivery-two",
      cardDefinitions: s.cardPool,
      championDefinitions: [],
      publicPlayers: [
        { userId: "tutorial-user", nickname: "검증" },
        { userId: "delivery-opponent", nickname: "상대" },
      ],
      introFirstSpeaker: null,
    },
  });
  return service.getRuntime(id);
}
const act = async (
  r,
  id,
  payload,
  user = "tutorial-user",
  version = r.version,
) => {
  const result = await service.applyMatchAction(
    r.matchId,
    user,
    id,
    version,
    payload,
  );
  if (!result.ok) console.log("REJECT", id, result.code, result.message);
  return result;
};

test("actual catalog PvP Pandora selection survives persisted reconnect, hides opponent targets and resolves exactly once", async () => {
  let r = await fixture("PANDORA");
  assert.ok((await act(r, "ability", { type: "USE_CHAMPION_ABILITY" })).ok);
  assert.ok(
    (
      await act(r, "pick1", {
        type: "SELECT_EFFECT_TARGET",
        targetId: "enemy-0",
      })
    ).ok,
  );
  const key = r.matchId;
  service.cleanupMatchRuntime(key);
  r = await service.getRuntime(key);
  assert.deepEqual(r.state.targetingState.selectedTargetIds, ["enemy-0"]);
  assert.equal(
    service.snapshotMessage(r, "delivery-opponent").state.targetingState,
    undefined,
  );
  assert.ok(
    (
      await act(r, "pick2", {
        type: "SELECT_EFFECT_TARGET",
        targetId: "enemy-1",
      })
    ).ok,
  );
  const version = r.version;
  assert.ok(
    (
      await act(r, "confirm", {
        type: "SELECT_EFFECT_TARGET",
        targetId: "effect:confirm",
      })
    ).ok,
  );
  assert.equal(r.state.targetingState, undefined);
  assert.equal(r.state.players[0].health, 14);
  assert.equal(r.state.players[1].graveyard.length, 2);
  assert.equal(r.state.players[0].champion.questConditionCounts.root, 2);
  assert.ok(
    (
      await act(
        r,
        "confirm",
        { type: "SELECT_EFFECT_TARGET", targetId: "effect:confirm" },
        "tutorial-user",
        version,
      )
    ).duplicate,
  );
  assert.equal(r.state.players[0].health, 14);
});
test("actual catalog PvP Mimic candidates are private, persisted and mandatory; chosen finisher is synchronized once", async () => {
  let r = await fixture("DISCOVER");
  assert.ok(
    (await act(r, "play", { type: "PLAY_TECHNIQUE", cardInstanceId: "mimic" }))
      .ok,
  );
  assert.equal(r.state.targetingState.catalogChoice.definitionIds.length, 3);
  const candidates = r.state.targetingState.validTargetIds;
  assert.equal(
    service.snapshotMessage(r, "delivery-opponent").state.targetingState,
    undefined,
  );
  assert.equal(
    service.snapshotMessage(r, "delivery-opponent").state
      .waitingForFinisherCastPlayerId,
    "PLAYER_ONE",
  );
  assert.equal(
    (await act(r, "cancel", { type: "CANCEL_EFFECT_TARGET" })).ok,
    false,
  );
  const key = r.matchId;
  service.cleanupMatchRuntime(key);
  r = await service.getRuntime(key);
  assert.deepEqual(r.state.targetingState.validTargetIds, candidates);
  assert.ok(
    (
      await act(r, "choose", {
        type: "SELECT_EFFECT_TARGET",
        targetId: candidates[0],
      })
    ).ok,
  );
  assert.equal(r.state.players[0].hand[0].definitionId, candidates[0].slice(8));
  assert.equal(r.state.targetingState, undefined);
  service.cleanupMatchRuntime(key);
  r = await service.getRuntime(key);
  assert.equal(r.state.players[0].hand.length, 1);
  assert.equal(
    service.snapshotMessage(r, "delivery-opponent").state.players[0].hand.count,
    1,
  );
});
