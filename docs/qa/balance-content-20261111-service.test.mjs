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
  if (
    [
      "PANDORA",
      "PANDORA_REACTION",
      "PLAIN_SPELL",
      "PLAIN_CARD",
      "PIN_CARD",
    ].includes(mode)
  ) {
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
    if (mode === "PANDORA_REACTION") {
      Object.assign(s.players[1].board[0], {
        currentHealth: 2,
        maxHealth: 2,
        abilities: [
          { trigger: "EXACT_ZERO_DAMAGE", effects: [] },
          {
            trigger: "SELF_DAMAGED",
            oncePerTurn: true,
            effects: [
              {
                type: "STRUCTURED",
                action: "DAMAGE",
                target: {
                  zone: "BOARD",
                  owner: "SELF",
                  selection: "SELF",
                  count: 1,
                },
                values: { amount: 1 },
              },
            ],
          },
        ],
      });
      s.players[1].board[1] = null;
    }
    if (!["PANDORA", "PANDORA_REACTION"].includes(mode)) {
      const technique = mode === "PLAIN_SPELL";
      const source = {
        ...unit,
        id: "pinfall-service-source-" + mode,
        cardType: technique ? "TECHNIQUE" : "WRESTLER",
        abilities: [
          {
            trigger: technique ? "ACTIVE" : "ENTER_FIELD",
            effects: [
              {
                type: "STRUCTURED",
                action: "DAMAGE",
                target: {
                  zone: "BOARD",
                  owner: "ENEMY",
                  selection: "ALL",
                  count: 4,
                },
                values: { amount: 1 },
              },
            ],
          },
          ...(mode === "PIN_CARD"
            ? [
                {
                  trigger: "EXACT_ZERO_DAMAGE",
                  effects: [
                    {
                      type: "STRUCTURED",
                      action: "BUFF",
                      target: {
                        zone: "BOARD",
                        owner: "SELF",
                        selection: "SELF",
                        count: 1,
                      },
                      values: { attack: 3, health: 0 },
                    },
                  ],
                },
              ]
            : []),
        ],
      };
      s.cardPool.push(source);
      s.players[0].hand = [
        generateCardInstance(source, { instanceId: "pinfall-source" }),
      ];
    }
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

test("actual PvP Pandora single selection survives reconnect and resolves once", async () => {
  let r=await fixture("PANDORA");
  assert.ok((await act(r,"ability",{type:"BEGIN_TARGETED_ACTION",action:{type:"USE_CHAMPION_ABILITY"}})).ok);
  assert.equal(r.state.targetingState.maxTargets,1);
  assert.equal(r.state.players[0].currentGold,4);
  const key=r.matchId;service.cleanupMatchRuntime(key);r=await service.getRuntime(key);
  assert.equal(r.state.targetingState.maxTargets,1);
  assert.equal(service.snapshotMessage(r,"delivery-opponent").state.targetingState,undefined);
  const version=r.version;
  assert.ok((await act(r,"pick1",{type:"CONFIRM_PRECOMMIT_TARGET",targetId:"enemy-0"})).ok);
  assert.equal(r.state.targetingState,undefined);
  assert.equal(r.state.players[0].health,12);
  assert.equal(r.state.players[1].graveyard.length,1);
  assert.equal(r.state.players[1].board[1].currentHealth,1);
  assert.equal(r.state.players[0].champion.questConditionCounts.root,1);
  assert.ok((await act(r,"pick1",{type:"CONFIRM_PRECOMMIT_TARGET",targetId:"enemy-0"},"tutorial-user",version)).duplicate);
  assert.equal(r.state.players[0].health,12);
  assert.equal((await act(r,"extra",{type:"SELECT_EFFECT_TARGET",targetId:"enemy-1"})).ok,false);
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

for (const mode of ["PLAIN_SPELL", "PLAIN_CARD", "PIN_CARD"]) {
  test(`PvP ${mode} pinfall eligibility, preparation and both views persist after reconnect`, async () => {
    let r = await fixture(mode);
    const result = await act(
      r,
      "source-play",
      mode === "PLAIN_SPELL"
        ? { type: "PLAY_TECHNIQUE", cardInstanceId: "pinfall-source" }
        : {
            type: "PLAY_WRESTLER",
            cardInstanceId: "pinfall-source",
            boardSlot: 0,
          },
    );
    assert.ok(result.ok, result.message);
    const expected = mode === "PIN_CARD" ? 2 : 0;
    assert.equal(r.state.players[1].graveyard.length, 2);
    assert.equal(
      r.state.players[0].champion.questConditionCounts?.root ?? 0,
      expected,
    );
    if (mode !== "PLAIN_SPELL")
      assert.equal(
        r.state.players[0].board[0].currentAttack,
        mode === "PIN_CARD" ? 8 : 2,
      );
    const matchId = r.matchId;
    service.cleanupMatchRuntime(matchId);
    r = await service.getRuntime(matchId);
    assert.equal(
      r.state.players[0].champion.questConditionCounts?.root ?? 0,
      expected,
    );
    for (const viewer of ["tutorial-user", "delivery-opponent"]) {
      const snapshot = service.snapshotMessage(r, viewer).state;
      assert.equal(
        snapshot.players[0].champion.questConditionCounts?.root ?? 0,
        expected,
      );
      const retirements = snapshot.events.filter(
        (e) => e.type === "CARD_RETIRED",
      );
      assert.equal(retirements.filter((e) => e.exactZero).length, expected);
    }
  });
}

test("Pandora cannot heal from another card's nested pinfall; both views persist", async () => {
  let r=await fixture("PANDORA_REACTION");
  assert.ok((await act(r,"ability",{type:"BEGIN_TARGETED_ACTION",action:{type:"USE_CHAMPION_ABILITY"}})).ok);
  const version=r.version;
  assert.ok((await act(r,"pick",{type:"CONFIRM_PRECOMMIT_TARGET",targetId:"enemy-0"})).ok);
  const retired=r.state.events.find(e=>e.type==="CARD_RETIRED");
  assert.ok(retired?.exactZero);
  assert.deepEqual(retired.source,{type:"CARD",cardInstanceId:"enemy-0"});
  assert.equal(r.state.players[0].health,10);
  assert.ok((await act(r,"pick",{type:"CONFIRM_PRECOMMIT_TARGET",targetId:"enemy-0"},"tutorial-user",version)).duplicate);
  const id=r.matchId;service.cleanupMatchRuntime(id);r=await service.getRuntime(id);
  for(const user of ["tutorial-user","delivery-opponent"])assert.equal(service.snapshotMessage(r,user).state.players[0].health,10);
});
