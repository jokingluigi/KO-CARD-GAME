/** Actual PvP service and persistence; disposable PostgreSQL-compatible DB only. */
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { createInitialGameState } from "../../artifacts/ko-game/src/game/engine/create-initial-game-state.ts";
import { MAX_HAND_SIZE } from "../../artifacts/ko-game/src/game/rules/constants.ts";
import { generateCardInstance } from "../../artifacts/ko-game/src/game/cards/generation.ts";
let f, service;
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
  await f.db
    .insert(f.schema.usersTable)
    .values({
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
const act = (r, id, payload, user = "tutorial-user", version = r.version) =>
  service.applyMatchAction(r.matchId, user, id, version, payload);
test("PvP automatic finisher: free cost, mandatory target, both clients, timeout, persisted reconnect and duplicate request", async () => {
  let r = await fixture();
  let result = await act(r, "play", {
    type: "PLAY_WRESTLER",
    cardInstanceId: "source",
    boardSlot: 0,
  });
  assert.ok(result.ok, result.message);
  assert.equal(r.state.players[0].currentGold, 2);
  assert.equal(r.state.players[0].hand.length, 0);
  assert.equal(
    r.state.players[0].graveyard.filter((c) => c.definitionId === spell.id)
      .length,
    1,
  );
  assert.ok(r.state.targetingState);
  const own = service.snapshotMessage(r, "tutorial-user"),
    other = service.snapshotMessage(r, "delivery-opponent");
  assert.ok(own.state.targetingState);
  assert.equal(other.state.targetingState, undefined);
  assert.equal(other.state.waitingForFinisherCastPlayerId, "PLAYER_ONE");
  assert.equal(other.state.pendingFinisherCasts, undefined);
  assert.equal(
    (await act(r, "cancel", { type: "CANCEL_EFFECT_TARGET" })).ok,
    false,
  );
  assert.equal(
    (
      await act(
        r,
        "wrong",
        { type: "SELECT_EFFECT_TARGET", targetId: "source" },
        "delivery-opponent",
      )
    ).ok,
    false,
  );
  const id = r.matchId;
  service.cleanupMatchRuntime(id);
  r = await service.getRuntime(id);
  assert.ok(r.state.targetingState);
  r.turnDeadlineAt = Date.now() - 1;
  const version = r.version;
  result = await act(r, "choose", {
    type: "SELECT_EFFECT_TARGET",
    targetId: "source",
  });
  assert.ok(result.ok, result.message);
  assert.equal(r.state.players[0].board[0].currentAttack, 4);
  assert.equal(r.state.targetingState, undefined);
  assert.equal(r.state.players[0].currentGold, 2);
  const repeat = await act(
    r,
    "choose",
    { type: "SELECT_EFFECT_TARGET", targetId: "source" },
    "tutorial-user",
    version,
  );
  assert.ok(repeat.ok && repeat.duplicate);
  assert.equal(r.state.players[0].board[0].currentAttack, 4);
  assert.equal(
    service.snapshotMessage(r, "delivery-opponent").state
      .waitingForFinisherCastPlayerId,
    undefined,
  );
});
test("PvP normal delivery adds exactly one linked card and persists the completed condition", async () => {
  let r = await fixture("HAND");
  assert.ok(
    (
      await act(r, "play", {
        type: "PLAY_WRESTLER",
        cardInstanceId: "source",
        boardSlot: 0,
      })
    ).ok,
  );
  assert.equal(r.state.players[0].hand[0].definitionId, spell.id);
  assert.equal(r.state.players[0].champion.questCompleted, true);
  const id = r.matchId;
  service.cleanupMatchRuntime(id);
  r = await service.getRuntime(id);
  assert.equal(
    r.state.players[0].hand.filter((c) => c.definitionId === spell.id).length,
    1,
  );
  assert.equal(
    service.snapshotMessage(r, "delivery-opponent").state.players[0].hand.count,
    1,
  );
});

test("PvP full hand uses one mandatory discard before linked finisher arrival and survives persisted reload", async () => {
  let r = await fixture("HAND", true);
  assert.ok(
    (
      await act(r, "play", {
        type: "PLAY_WRESTLER",
        cardInstanceId: "source",
        boardSlot: 0,
      })
    ).ok,
  );
  assert.ok(r.state.targetingState?.handAddition);
  assert.equal(r.state.players[0].hand.length, MAX_HAND_SIZE);
  assert.equal(
    r.state.players[0].hand.some((c) => c.definitionId === spell.id),
    false,
  );
  assert.equal(
    service.snapshotMessage(r, "delivery-opponent").state
      .waitingForHandDiscardPlayerId,
    "PLAYER_ONE",
  );
  const id = r.matchId;
  service.cleanupMatchRuntime(id);
  r = await service.getRuntime(id);
  assert.ok(r.state.targetingState.handAddition);
  assert.ok(
    (
      await act(r, "discard", {
        type: "SELECT_EFFECT_TARGET",
        targetId: "old-0",
      })
    ).ok,
  );
  assert.equal(r.state.players[0].hand.length, MAX_HAND_SIZE);
  assert.equal(
    r.state.players[0].hand.filter((c) => c.definitionId === spell.id).length,
    1,
  );
  assert.equal(
    r.state.players[0].graveyard.filter((c) => c.instanceId === "old-0").length,
    1,
  );
  assert.equal(r.state.targetingState, undefined);
});
