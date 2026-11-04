import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
let f, service, engine;
const matches = [];
before(async () => {
  f = await startTutorialFixture();
  engine = await import("../../lib/game-engine/src/index.ts");
  service = await import("../../artifacts/api-server/src/online/service.ts");
  await f.db
    .insert(f.schema.usersTable)
    .values({
      id: "finisher-opponent",
      email: "opponent@example.invalid",
      nickname: "기반 검증 상대",
      passwordHash: "unusable",
      role: "USER",
    });
  await f.db.insert(f.schema.decksTable).values([
    { id: "foundation-one", userId: "tutorial-user", name: "검증 덱" },
    { id: "foundation-two", userId: "finisher-opponent", name: "검증 덱" },
  ]);
});
after(async () => {
  for (const id of matches) service.cleanupMatchRuntime(id);
  await f.close();
});
const unit = {
  id: "qa-foundation-unit",
  name: "검증 선수",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 1,
  attack: 1,
  health: 4,
  rulesText: "",
  keywords: [],
  abilities: [],
};
async function fixture(id, mode = "generate") {
  const { generateCardInstance } =
    await import("../../artifacts/ko-game/src/game/cards/generation.ts");
  const s = engine.createInitialGameState();
  s.gameId = id;
  s.status = "IN_PROGRESS";
  s.activePlayerId = "PLAYER_ONE";
  s.turn = 3;
  s.events = [];
  s.cardPool = [unit];
  s.players = s.players.map((p, i) => ({
    ...p,
    id: i ? "PLAYER_TWO" : "PLAYER_ONE",
    currentGold: 10,
    hand: [],
    deck: [],
    board: [null, null, null, null],
    champion: {
      ...p.champion,
      quest: null,
      questCompleted: false,
      championTokenDefinitionId: null,
    },
  }));
  const p = s.players[0];
  p.hand = Array.from({ length: 7 }, (_, i) =>
    generateCardInstance(unit, { instanceId: "old-" + i }),
  );
  p.deck = Array.from({ length: 10 }, (_, i) =>
    generateCardInstance(unit, { instanceId: "deck-" + i }),
  );
  p.champion.ability = {
    id: "qa-generator",
    name: "검증 생성",
    cost: 1,
    description: "검증",
    effects: [
      {
        type: "STRUCTURED",
        action: "GENERATE",
        values: { definitionRef: { id: unit.id }, count: 2 },
      },
      { type: "STRUCTURED", action: "ADD_GOLD", values: { amount: 2 } },
    ],
  };
  if (mode === "ability") {
    const damage = (amount, owner) => [
      {
        type: "STRUCTURED",
        action: "DAMAGE",
        target: {
          zone: "BOARD",
          owner,
          selection: "PLAYER_CHOICE",
          cardType: "WRESTLER",
          count: 1,
        },
        values: { amount, destroyOnLethal: true },
      },
    ];
    p.champion.ability = {
      id: "qa-base",
      name: "기본 검증",
      cost: 1,
      description: "1 피해",
      effects: damage(1, "ALL"),
    };
    p.champion.upgradedAbility = {
      id: "qa-upgraded",
      name: "강화 검증",
      cost: 2,
      description: "상대 2 피해",
      effects: damage(2, "ENEMY"),
    };
    const spell = {
      ...unit,
      id: "qa-replacement",
      name: "능력 교체 검증 주문",
      cardType: "TECHNIQUE",
      rarity: "CHAMPION",
      cost: 0,
      attack: 0,
      health: 0,
      rulesText: "검증용",
      isToken: true,
      isChampionToken: true,
      abilities: [
        {
          trigger: "ACTIVE",
          effects: [
            {
              type: "STRUCTURED",
              action: "REPLACE_CHAMPION_ABILITY",
              values: { abilityReplacement: { variant: "UPGRADED" } },
            },
          ],
        },
      ],
    };
    s.cardPool.push(spell);
    p.hand = [generateCardInstance(spell, { instanceId: "replace" })];
    p.board[0] = {
      ...generateCardInstance(unit, { instanceId: "ally" }),
      boardSlot: 0,
    };
    s.players[1].board[0] = {
      ...generateCardInstance(unit, { instanceId: "enemy" }),
      boardSlot: 0,
    };
  }
  const snapshot = {
    player1UserId: "tutorial-user",
    player2UserId: "finisher-opponent",
    player1DeckId: "foundation-one",
    player2DeckId: "foundation-two",
    cardDefinitions: s.cardPool,
    championDefinitions: [],
    publicPlayers: [
      { userId: "tutorial-user", nickname: "검증" },
      { userId: "finisher-opponent", nickname: "상대" },
    ],
    introFirstSpeaker: null,
  };
  await f.db
    .insert(f.schema.onlineMatchesTable)
    .values({
      id,
      status: "ACTIVE",
      player1UserId: "tutorial-user",
      player2UserId: "finisher-opponent",
      player1DeckId: "foundation-one",
      player2DeckId: "foundation-two",
      serializedSnapshot: snapshot,
      serializedGameState: s,
    });
  matches.push(id);
  return await service.getRuntime(id);
}
const act = (id, request, version, payload, user = "tutorial-user") =>
  service.applyMatchAction(id, user, request, version, payload);
test("authoring API accepts reusable ability replacement and rejects invalid definitions", async () => {
  const base = {
    name: "격리 교체 주문",
    cardType: "TECHNIQUE",
    rarity: "CHAMPION",
    cost: 1,
    attack: 0,
    health: 0,
    text: "검증",
    isToken: true,
    isChampionToken: true,
    keywords: [],
    tags: [],
    effectId: "STRUCTURED_EFFECTS_V1",
    effectConfig: {
      effects: [
        {
          trigger: "ACTIVE",
          action: "REPLACE_CHAMPION_ABILITY",
          values: { abilityReplacement: { variant: "UPGRADED" } },
        },
      ],
    },
  };
  const save = (body) =>
    fetch(f.origin + "/api/admin/cards", {
      method: "POST",
      headers: { Cookie: f.cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const r = await save(base);
  assert.equal(r.status, 201, await r.clone().text());
  const data = await r.json();
  assert.equal(data.card.rarity, "CHAMPION");
  assert.deepEqual(data.card.effectConfig, base.effectConfig);
  const bad = structuredClone(base);
  bad.effectConfig.effects[0].values.abilityReplacement = {
    ability: {
      id: "invalid",
      name: "invalid",
      description: "",
      cost: -1,
      effects: [],
    },
  };
  assert.equal((await save(bad)).status, 400);
});
test("real online service commits full-hand addition, private choice, reconnect and exactly-once continuation", async () => {
  let runtime = await fixture("foundation-overflow");
  const start = await act(runtime.matchId, "generate", 0, {
    type: "USE_CHAMPION_ABILITY",
  });
  assert.ok(start.ok, start.message ?? start.code);
  assert.ok(runtime.state.targetingState.handAddition);
  assert.equal(runtime.state.players[0].currentGold, 9);
  const own = service.snapshotMessage(runtime, "tutorial-user"),
    opponent = service.snapshotMessage(runtime, "finisher-opponent");
  assert.equal(own.state.targetingState.handAddition.cards.length, 2);
  assert.equal(opponent.state.targetingState, undefined);
  assert.equal(opponent.state.waitingForHandDiscardPlayerId, "PLAYER_ONE");
  assert.ok(!JSON.stringify(opponent).includes("hand-addition:"));
  assert.equal(
    (
      await act(
        runtime.matchId,
        "wrong-seat",
        1,
        { type: "SELECT_EFFECT_TARGET", targetId: "old-0" },
        "finisher-opponent",
      )
    ).ok,
    false,
  );
  runtime.turnDeadlineAt = Date.now() - 1; // A human can finish the required choice after the original deadline.
  let r = await act(runtime.matchId, "discard-first", 1, {
    type: "SELECT_EFFECT_TARGET",
    targetId: "old-0",
  });
  assert.ok(r.ok, r.message ?? r.code);
  assert.equal(runtime.state.players[0].graveyard.length, 1);
  assert.equal(runtime.state.players[0].currentGold, 9);
  const duplicate = await act(runtime.matchId, "discard-first", 1, {
    type: "SELECT_EFFECT_TARGET",
    targetId: "old-0",
  });
  assert.ok(duplicate.ok && duplicate.duplicate);
  assert.equal(runtime.state.players[0].graveyard.length, 1);
  service.cleanupMatchRuntime(runtime.matchId);
  runtime = await service.getRuntime(runtime.matchId);
  assert.equal(runtime.state.targetingState.handAddition.cards.length, 1);
  r = await act(runtime.matchId, "discard-second", 2, {
    type: "SELECT_EFFECT_TARGET",
    targetId: "old-1",
  });
  assert.ok(r.ok, r.message ?? r.code);
  assert.equal(runtime.state.players[0].hand.length, 7);
  assert.equal(runtime.state.players[0].graveyard.length, 2);
  assert.equal(runtime.state.players[0].currentGold, 11);
  assert.equal(runtime.state.targetingState, undefined);
  assert.equal(runtime.version, 3);
});
test("server ability replacement switches actual target validation/cost and preserves same-turn use limit across reconnect", async () => {
  let runtime = await fixture("foundation-ability", "ability");
  let r = await act(runtime.matchId, "base", 0, {
    type: "BEGIN_TARGETED_ACTION",
    action: { type: "USE_CHAMPION_ABILITY" },
  });
  assert.ok(r.ok);
  assert.ok(runtime.state.targetingState.validTargetIds.includes("ally"));
  r = await act(runtime.matchId, "base-confirm", 1, {
    type: "CONFIRM_PRECOMMIT_TARGET",
    targetId: "ally",
  });
  assert.ok(r.ok);
  assert.equal(runtime.state.players[0].board[0].currentHealth, 3);
  r = await act(runtime.matchId, "replace", 2, {
    type: "PLAY_TECHNIQUE",
    cardInstanceId: "replace",
  });
  assert.ok(r.ok, r.message ?? r.code);
  assert.equal(runtime.state.players[0].championAbilityUsedThisTurn, true);
  assert.equal(
    (
      await act(runtime.matchId, "extra-use", 3, {
        type: "USE_CHAMPION_ABILITY",
      })
    ).ok,
    false,
  );
  for (const user of ["tutorial-user", "finisher-opponent"])
    assert.equal(
      service.snapshotMessage(runtime, user).state.players[0].champion
        .abilityOverride.id,
      "qa-upgraded",
    );
  service.cleanupMatchRuntime(runtime.matchId);
  runtime = await service.getRuntime(runtime.matchId);
  assert.equal(runtime.state.players[0].champion.abilityOverride.cost, 2);
  runtime.state.players[0].championAbilityUsedThisTurn = false;
  runtime.turnDeadlineAt = null;
  r = await act(runtime.matchId, "upgraded", 3, {
    type: "BEGIN_TARGETED_ACTION",
    action: { type: "USE_CHAMPION_ABILITY" },
  });
  assert.ok(r.ok);
  assert.deepEqual(runtime.state.targetingState.validTargetIds, ["enemy"]);
  assert.equal(
    (
      await act(runtime.matchId, "invalid-ally", 4, {
        type: "CONFIRM_PRECOMMIT_TARGET",
        targetId: "ally",
      })
    ).ok,
    false,
  );
  r = await act(runtime.matchId, "valid-enemy", 4, {
    type: "CONFIRM_PRECOMMIT_TARGET",
    targetId: "enemy",
  });
  assert.ok(r.ok);
  assert.equal(runtime.state.players[1].board[0].currentHealth, 2);
  assert.equal(runtime.state.players[0].currentGold, 7);
});
