import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "./create-initial-game-state";
import { generateCardInstance } from "../cards/generation";
import { processChampionQuestEvents } from "../champions/quests";
import {
  validFinisherReward,
  validFinisherChoices,
} from "../champions/finisher-config";
import { currentChampionAbility } from "../champions/types";
import { executeAction, getLegalActions } from "../actions/engine-actions";
import { chooseBestAction } from "../actions/ai-evaluator";
import { MAX_HAND_SIZE } from "../rules/constants";
import type { CardDefinition } from "../cards/types";
const body: CardDefinition = {
  id: "delivery-body",
  name: "검증 선수",
  cardType: "WRESTLER",
  cost: 1,
  attack: 1,
  health: 3,
  keywords: [],
  rulesText: "",
  abilities: [],
};
const spell: CardDefinition = {
  ...body,
  id: "delivery-finisher",
  name: "검증 피니셔",
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
          action: "DAMAGE",
          target: {
            zone: "PLAYER",
            owner: "ENEMY",
            selection: "ALL",
            count: 1,
          },
          values: { amount: 4 },
        },
      ],
    },
  ],
};
function setup(delivery: "HAND" | "CAST" = "HAND") {
  const s = createInitialGameState(undefined, [body, spell]);
  s.status = "IN_PROGRESS";
  s.turn = 3;
  s.activePlayerId = "player-1";
  s.openingMulligan = undefined;
  s.cardPool = [body, spell];
  s.events = [];
  for (const p of s.players) {
    p.hand = [];
    p.deck = [];
    p.board = [null, null, null, null];
    p.graveyard = [];
    p.currentGold = 0;
    p.health = p.maxHealth = 20;
    p.champion!.health = p.champion!.maxHealth = 20;
    p.champion!.quest = null;
    p.champion!.questCompleted = false;
    p.champion!.questProgress = 0;
  }
  s.players[0].champion!.quest = {
    id: "delivery-q",
    name: "피니셔 준비",
    description: "카드 1장 사용",
    trackedEvent: "CARD_PLAYED",
    requiredProgress: 1,
    finisher: { cardDefinitionId: spell.id, delivery },
    reward: { type: "GAIN_GOLD", amount: 99 },
  };
  return s;
}
function complete(s: ReturnType<typeof setup>) {
  return processChampionQuestEvents(s, {
    ...s,
    events: [
      ...s.events,
      {
        type: "CARD_PLAYED",
        playerId: "player-1",
        cardType: "WRESTLER",
        cardInstanceId: "trigger",
      },
    ],
  });
}
function act(
  s: ReturnType<typeof setup>,
  targetId: string,
  playerId = "player-1",
) {
  const r = executeAction(s, {
    type: "SELECT_EFFECT_TARGET",
    playerId,
    targetId,
  });
  assert.ok(r.success, JSON.stringify(r));
  return r.state;
}
test("single preparation adds the linked finisher, replacing only its configured legacy reward", () => {
  const s = setup(),
    base = s.players[0].champion!.ability;
  s.players[0].champion!.upgradedAbility = { ...base, id: "legacy-upgrade" };
  const n = complete(s);
  assert.equal(n.players[0].hand[0].definitionId, spell.id);
  assert.equal(n.players[0].currentGold, 0);
  assert.equal(n.players[0].champion!.questCompleted, true);
  assert.equal(currentChampionAbility(n.players[0].champion)?.id, base.id);
  assert.equal(n.players[1].health, 20);
  assert.equal(complete(n).players[0].hand.length, 1);
});
test("full-hand acquisition uses mandatory discard and resumes once after serialized reconnect", () => {
  const s = setup();
  s.players[0].hand = Array.from({ length: MAX_HAND_SIZE }, (_, i) =>
    generateCardInstance(body, { instanceId: "old-" + i }),
  );
  const n = complete(s);
  assert.ok(n.targetingState?.handAddition);
  const done = act(JSON.parse(JSON.stringify(n)), "old-0");
  assert.equal(done.players[0].hand.length, MAX_HAND_SIZE);
  assert.equal(done.players[0].graveyard[0].instanceId, "old-0");
  assert.equal(
    done.players[0].hand.filter((c) => c.definitionId === spell.id).length,
    1,
  );
  assert.equal(
    complete(done).players[0].hand.filter((c) => c.definitionId === spell.id)
      .length,
    1,
  );
});
test("instant mode casts without base gold or entering hand and preserves full hand", () => {
  const s = setup("CAST");
  s.players[0].hand = Array.from({ length: MAX_HAND_SIZE }, (_, i) =>
    generateCardInstance(body, { instanceId: "old-" + i }),
  );
  const n = complete(s);
  assert.equal(n.players[0].currentGold, 0);
  assert.equal(n.players[0].hand.length, MAX_HAND_SIZE);
  assert.equal(n.players[1].health, 16);
  assert.equal(
    n.players[0].graveyard.filter((c) => c.definitionId === spell.id).length,
    1,
  );
  assert.equal(n.targetingState, undefined);
  assert.equal(n.pendingFinisherCasts, undefined);
  assert.equal(complete(n).players[1].health, 16);
  assert.equal(
    n.events.filter((e) => e.reason === "FINISHER_AUTO_CAST").length,
    1,
  );
});
test("instant casts on the opponent turn and does not transfer turn ownership", () => {
  const s = setup("CAST");
  s.activePlayerId = "player-2";
  const n = complete(s);
  assert.equal(n.activePlayerId, "player-2");
  assert.equal(n.players[1].health, 16);
});
test("targeted instant finisher uses mandatory selection; opponent and duplicate selections fail", () => {
  const s = setup("CAST");
  s.cardPool![1] = {
    ...spell,
    abilities: [
      {
        trigger: "ACTIVE",
        effects: [
          {
            type: "STRUCTURED",
            action: "DAMAGE",
            target: {
              zone: "BOARD",
              owner: "ENEMY",
              selection: "PLAYER_CHOICE",
              count: 1,
            },
            values: { amount: 2 },
          },
        ],
      },
    ],
  };
  s.players[1].board[0] = {
    ...generateCardInstance(body, { instanceId: "enemy" }),
    boardSlot: 0,
  };
  s.activePlayerId = "player-2";
  const n = complete(s);
  assert.ok(n.targetingState);
  assert.equal(
    executeAction(n, { type: "CANCEL_EFFECT_TARGET", playerId: "player-1" })
      .success,
    false,
  );
  assert.ok(
    !getLegalActions(n, "player-1").some(
      (a) => a.type === "CANCEL_EFFECT_TARGET",
    ),
  );
  assert.deepEqual(n.targetingState.validTargetIds, ["enemy"]);
  assert.equal(
    executeAction(n, {
      type: "SELECT_EFFECT_TARGET",
      playerId: "player-2",
      targetId: "enemy",
    }).success,
    false,
  );
  const done = act(JSON.parse(JSON.stringify(n)), "enemy");
  assert.equal(done.players[1].board[0]?.currentHealth, 1);
  assert.equal(done.players[0].currentGold, 0);
  assert.equal(done.pendingFinisherCasts, undefined);
  assert.equal(
    executeAction(done, {
      type: "SELECT_EFFECT_TARGET",
      playerId: "player-1",
      targetId: "enemy",
    }).success,
    false,
  );
});
test("no valid instant target does not leave an impossible selector", () => {
  const s = setup("CAST");
  s.cardPool![1] = {
    ...spell,
    abilities: [
      {
        trigger: "ACTIVE",
        effects: [
          {
            type: "STRUCTURED",
            action: "DAMAGE",
            target: {
              zone: "BOARD",
              owner: "ENEMY",
              selection: "PLAYER_CHOICE",
              count: 1,
            },
            values: { amount: 2 },
          },
        ],
      },
    ],
  };
  const n = complete(s);
  assert.equal(n.targetingState, undefined);
  assert.equal(n.players[0].graveyard.length, 1);
  assert.equal(n.players[0].currentGold, 0);
});
test("different prepared options keep independent card and delivery settings; selected instant locks the others", () => {
  const s = setup();
  s.players[0].champion!.quest!.finisher = undefined;
  s.players[0].champion!.quest!.finisherChoices = [
    {
      id: "a",
      name: "손패",
      description: "",
      condition: { type: "TURN", turn: 99 },
      cardDefinitionId: spell.id,
      delivery: "HAND",
    },
    {
      id: "b",
      name: "즉시",
      description: "",
      condition: {
        type: "EVENT",
        event: "CARD_PLAYED",
        owner: "SELF",
        required: 1,
      },
      cardDefinitionId: spell.id,
      delivery: "CAST",
    },
  ];
  const n = complete(s);
  assert.equal(n.players[0].champion!.selectedFinisherId, "b");
  assert.equal(n.players[0].hand.length, 0);
  assert.equal(n.players[1].health, 16);
  assert.equal(complete(n).players[1].health, 16);
});
test("simultaneous conditions offer a choice, including an immediate-cast option to AI", () => {
  const s = setup();
  s.players[0].champion!.quest!.finisher = undefined;
  s.players[0].champion!.quest!.finisherChoices = ["a", "b"].map((id, i) => ({
    id,
    name: id,
    description: "",
    condition: {
      type: "EVENT" as const,
      event: "CARD_PLAYED" as const,
      owner: "SELF" as const,
      required: 1,
    },
    cardDefinitionId: spell.id,
    delivery: i ? ("CAST" as const) : ("HAND" as const),
  }));
  const n = complete(s);
  assert.ok(n.targetingState?.finisherChoice);
  const action = chooseBestAction(
    n,
    getLegalActions(n, "player-1"),
    "player-1",
  );
  assert.equal(action.type, "SELECT_EFFECT_TARGET");
  const done = act(JSON.parse(JSON.stringify(n)), "finisher:b");
  assert.equal(done.players[1].health, 16);
  assert.equal(done.players[0].hand.length, 0);
});
test("queued instant cast waits for a committed selection and survives reconnect", () => {
  const s = setup("CAST");
  s.players[0].board[0] = {
    ...generateCardInstance(body, { instanceId: "ally" }),
    boardSlot: 0,
  };
  s.players[0].board[1] = {
    ...generateCardInstance(body, { instanceId: "ally2" }),
    boardSlot: 1,
  };
  s.targetingState = {
    active: true,
    playerId: "player-1",
    sourceInstanceId: "ally",
    sourceCard: s.players[0].board[0],
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
        values: { attack: 1, health: 1 },
      },
    ],
    effectIndex: 0,
    selectedTargetIds: [],
    lastTargetIds: [],
    validTargetIds: ["ally2"],
    minTargets: 1,
    maxTargets: 1,
    mandatory: true,
    cancelable: false,
  };
  const n = complete(s);
  assert.ok(n.pendingFinisherCasts?.length);
  assert.equal(n.targetingState.sourceInstanceId, "ally");
  assert.equal(n.players[1].health, 20);
  const done = act(JSON.parse(JSON.stringify(n)), "ally2");
  assert.equal(done.players[1].health, 16);
  assert.equal(done.pendingFinisherCasts, undefined);
  assert.equal(done.players[0].board[1]?.currentAttack, 2);
});
test("finisher auto-cast events can complete the other champion preparation in the same resolution", () => {
  const s = setup("CAST");
  s.players[1].champion!.quest = {
    id: "other",
    name: "피니셔 준비",
    description: "",
    trackedEvent: "DAMAGE_DEALT",
    requiredProgress: 1,
    causedByOwner: false,
    reward: { type: "GAIN_GOLD", amount: 1 },
  };
  s.players[1].champion!.quest!.condition = {
    type: "HEALTH",
    owner: "SELF",
    op: "LTE",
    value: 16,
  };
  const n = complete(s);
  assert.equal(n.players[1].champion!.questCompleted, true);
});
test("delivery config rejects unsupported modes while accepting old options without a mode", () => {
  assert.equal(validFinisherReward({ cardDefinitionId: spell.id }), true);
  assert.equal(
    validFinisherReward({ cardDefinitionId: spell.id, delivery: "CAST" }),
    true,
  );
  assert.equal(
    validFinisherReward({ cardDefinitionId: spell.id, delivery: "FREE" }),
    false,
  );
  assert.equal(
    validFinisherReward({
      cardDefinitionId: spell.id,
      delivery: "HAND",
      unexpected: true,
    }),
    false,
  );
  const s = setup();
  assert.equal(
    validFinisherChoices([
      {
        id: "a",
        name: "a",
        description: "",
        condition: { type: "TURN", turn: 1 },
        cardDefinitionId: spell.id,
      },
      {
        id: "b",
        name: "b",
        description: "",
        condition: { type: "TURN", turn: 2 },
        cardDefinitionId: spell.id,
      },
    ]),
    true,
  );
});

test("optional auto-cast target may skip while continuing the next authored effect", () => {
  const s = setup("CAST");
  s.players[1].board[0] = {
    ...generateCardInstance(body, { instanceId: "enemy" }),
    boardSlot: 0,
  };
  s.cardPool![1] = {
    ...spell,
    abilities: [
      {
        trigger: "ACTIVE",
        effects: [
          {
            type: "STRUCTURED",
            action: "DAMAGE",
            target: {
              zone: "BOARD",
              owner: "ENEMY",
              selection: "PLAYER_CHOICE",
              count: 1,
              optionalTarget: true,
            },
            values: { amount: 1 },
          },
          ...spell.abilities[0].effects,
        ],
      },
    ],
  };
  const n = complete(s);
  assert.equal(n.targetingState?.cancelable, true);
  const skipped = executeAction(n, {
    type: "CANCEL_EFFECT_TARGET",
    playerId: "player-1",
  });
  assert.ok(skipped.success);
  assert.equal(skipped.state.players[1].health, 16);
  assert.equal(skipped.state.players[1].board[0]?.currentHealth, 3);
  assert.equal(skipped.state.targetingState, undefined);
});
test("empty instant finisher does not leave a sentinel frame or lock input", () => {
  const s = setup("CAST");
  s.cardPool![1] = { ...spell, abilities: [] };
  const n = complete(s);
  assert.equal(n.targetingState, undefined);
  assert.equal(n.pendingFinisherCasts, undefined);
  assert.ok(getLegalActions(n, "player-1").some((a) => a.type === "END_TURN"));
});
