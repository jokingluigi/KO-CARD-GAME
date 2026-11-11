import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialGameState } from "./create-initial-game-state";
import { generateCardInstance } from "../cards/generation";
import type { CardDefinition } from "../cards/types";
import type { CardEffect } from "../effects/types";
import { executeAction, getLegalActions } from "../actions/engine-actions";
import {
  resolveTriggeredAbilities,
  applyEffect,
} from "../effects/effect-engine";
import { enterField } from "./enter-field";
import { chooseBestAction } from "../actions/ai-evaluator";
import { validProgramValues } from "@workspace/effect-registry";
export const ally: CardDefinition = {
  id: "qa-program-ally",
  name: "검증 좀비",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 1,
  attack: 2,
  health: 3,
  rulesText: "",
  keywords: [],
  abilities: [],
};
export const program: CardEffect = {
  type: "STRUCTURED",
  action: "PROGRAM",
  values: {
    programCost: 2,
    programEffects: [
      {
        action: "BUFF",
        target: {
          zone: "BOARD",
          owner: "SELF",
          selection: "PLAYER_CHOICE",
          count: 1,
          filter: { excludeSource: true, definitionRef: { id: ally.id } },
        },
        values: { attack: 2, health: 2 },
      },
    ],
  },
};
export const unit: CardDefinition = {
  ...ally,
  id: "qa-program-unit",
  name: "업그레이드 검증용 선수",
  cost: 2,
  rulesText:
    "등장 — 업그레이드(2): 다른 아군 검증 좀비 1장에게 +2/+2를 부여합니다.",
  keywords: ["PROGRAM"],
  abilities: [{ trigger: "ENTER_FIELD", effects: [program] }],
};
export function fixture(gold = 4, withAlly = true) {
  const s = createInitialGameState();
  s.status = "IN_PROGRESS";
  s.activePlayerId = "player-1";
  s.turn = 3;
  s.cardPool = [unit, ally];
  for (const p of s.players) p.champion!.quest = null;
  s.players[0].currentGold = gold;
  s.players[0].hand = [
    generateCardInstance(structuredClone(unit), { instanceId: "program" }),
  ];
  if (withAlly)
    s.players[0].board[0] = {
      ...generateCardInstance(ally, { instanceId: "ally" }),
      boardSlot: 0,
      enteredThisTurn: false,
    };
  return s;
}
export function play(s = fixture()) {
  const r = executeAction(s, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "program",
    boardSlot: 1,
  });
  assert.ok(r.success, JSON.stringify(r));
  return r.state;
}
export function select(s: ReturnType<typeof fixture>) {
  const r = executeAction(s, {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "ally",
  });
  assert.ok(r.success, JSON.stringify(r));
  return r.state;
}
for (const gold of [2, 3, 4, 6])
  test(`base 2 + fixed upgrade 1 at gold ${gold}`, () => {
    const s = play(fixture(gold));
    assert.equal(s.players[0].currentGold, gold - 2 - (gold >= 3 ? 1 : 0));
    assert.ok(s.players[0].board[1]);
    assert.equal(
      s.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
      gold >= 3 ? 1 : 0,
    );
    assert.equal(Boolean(s.targetingState), gold >= 3);
    if (gold >= 3) {
      const n = select(s);
      assert.equal(n.players[0].board[0]?.currentAttack, 4);
      assert.equal(n.players[0].board[0]?.currentHealth, 5);
      assert.equal(n.targetingState, undefined);
    }
  });
for (const cost of [1, 3])
  test(`actual modified card cost ${cost} remains separate`, () => {
    const s = fixture(cost + 1);
    s.players[0].hand[0].currentCost = cost;
    const n = select(play(s));
    assert.equal(n.players[0].currentGold, 0);
    assert.deepEqual(
      n.events.filter((e) => e.type === "GOLD_CHANGED").map((e) => e.amount),
      [-cost, -1],
    );
  });
test("no valid target: no payment, targeting or success event", () => {
  const s = play(fixture(4, false));
  assert.equal(s.players[0].currentGold, 2);
  assert.equal(s.targetingState, undefined);
  assert.equal(
    s.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    0,
  );
});
test("paid target choice cannot be cancelled; invalid/duplicate requests cannot repay", () => {
  const s = play();
  const invalid = executeAction(s, {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "invalid",
  });
  assert.equal(invalid.success, false);
  assert.equal(invalid.state.players[0].currentGold, 1);
  const cancel = executeAction(s, {
    type: "CANCEL_EFFECT_TARGET",
    playerId: "player-1",
  });
  assert.equal(cancel.success, false);
  const restored = JSON.parse(JSON.stringify(s));
  const n = select(restored);
  const again = executeAction(n, {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "ally",
  });
  assert.equal(again.success, false);
  assert.equal(
    n.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    1,
  );
  assert.equal(n.players[0].currentGold, 1);
});
test("same entry event is attempted only once, even after gold is restored", () => {
  const s = select(play());
  s.players[0].currentGold = 6;
  const n = resolveTriggeredAbilities(
    s,
    "player-1",
    s.players[0].board[1]!,
    "ENTER_FIELD",
  );
  assert.equal(n.players[0].currentGold, 6);
  assert.equal(n.targetingState, undefined);
  assert.equal(
    n.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    1,
  );
});
test("a failed attempt cannot retroactively trigger on duplicate entry resolution", () => {
  const s = play(fixture(2));
  s.players[0].currentGold = 6;
  const n = resolveTriggeredAbilities(
    s,
    "player-1",
    s.players[0].board[1]!,
    "ENTER_FIELD",
  );
  assert.equal(n.players[0].currentGold, 6);
  assert.equal(n.targetingState, undefined);
});
test("a new physical entry can pay again", () => {
  let s = select(play());
  const card = s.players[0].board[1]!;
  s.players[0].board[1] = null;
  s.players[0].currentGold = 2;
  s = enterField(
    s,
    "player-1",
    card,
    1,
    undefined,
    undefined,
    "CHAMPION_DEPLOY",
  );
  assert.equal(s.players[0].currentGold, 1);
  assert.equal(
    s.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    2,
  );
});
for (const cause of ["SUMMON", "REVIVE", "CHAMPION_DEPLOY"] as const)
  test(`entry semantics preserved for ${cause}`, () => {
    const s = fixture();
    s.players[0].hand = [];
    const n = enterField(
      s,
      "player-1",
      generateCardInstance(structuredClone(unit), { instanceId: "program" }),
      1,
      undefined,
      undefined,
      cause,
    );
    assert.equal(n.players[0].currentGold, cause === "CHAMPION_DEPLOY" ? 3 : 4);
    assert.equal(Boolean(n.targetingState), cause === "CHAMPION_DEPLOY");
  });
test("ordinary entry effects before and after PROGRAM execute exactly once in definition order", () => {
  const s = fixture(3);
  s.players[0].hand[0].abilities = [
    {
      trigger: "ENTER_FIELD",
      effects: [
        { type: "GAIN_GOLD", amount: 1 },
        program,
        { type: "GAIN_GOLD", amount: 1 },
      ],
    },
  ];
  const paid = play(s);
  assert.equal(paid.players[0].currentGold, 1);
  const n = select(paid);
  assert.equal(n.players[0].currentGold, 2);
  assert.deepEqual(
    n.events.filter((e) => e.type === "GOLD_CHANGED").map((e) => e.amount),
    [-2, 1, -1, 1],
  );
});
test("targetless PROGRAM resolves through the same automatic interpreter", () => {
  const s = fixture(2, false);
  const n = applyEffect(s, "player-1", s.players[0].hand[0], {
    type: "STRUCTURED",
    action: "PROGRAM",
    values: {
      programCost: 2,
      programEffects: [{ action: "ADD_GOLD", values: { amount: 1 } }],
    },
  });
  assert.equal(n.players[0].currentGold, 2);
  assert.equal(n.targetingState, undefined);
});
test("PROGRAM spend counts toward existing gold-spent preparation", () => {
  const s = fixture();
  s.players[0].champion!.quest = {
    id: "qa-gold",
    name: "검증",
    description: "검증",
    requiredProgress: 30,
    goldSpent: true,
    eventTypes: ["GOLD_CHANGED"],
    rewardEffects: [],
  } as any;
  const n = play(s);
  assert.equal(n.players[0].champion!.questProgress, 3);
  assert.equal(select(n).players[0].champion!.questProgress, 3);
});
test("AI resolves the same mandatory target automatically", () => {
  const s = play();
  const actions = getLegalActions(s, "player-1");
  assert.ok(actions.length);
  assert.ok(actions.every((a) => a.type === "SELECT_EFFECT_TARGET"));
  const action = chooseBestAction(s, actions, "player-1");
  assert.equal(action.type, "SELECT_EFFECT_TARGET");
  const n = executeAction(s, action);
  assert.ok(n.success);
  assert.equal(n.state.players[0].board[0]?.currentAttack, 4);
});
test("invalid or empty program definitions are rejected", () => {
  for (const values of [
    { programCost: -1, programEffects: [] },
    {
      programCost: 1.5,
      programEffects: [{ action: "DRAW", values: { amount: 1 } }],
    },
    { programCost: 2, programEffects: [] },
    { programCost: 2, programEffects: [{ action: "PROGRAM", values: {} }] },
  ])
    assert.equal(validProgramValues(values), false);
  assert.equal(validProgramValues((program as any).values), true);
});
test("unrelated optional effect after paid group can be skipped without rolling back payment", () => {
  const s = fixture();
  s.players[0].hand[0].abilities[0].effects.push({
    type: "STRUCTURED",
    action: "BUFF",
    target: {
      zone: "BOARD",
      owner: "SELF",
      selection: "PLAYER_CHOICE",
      count: 1,
      optionalTarget: true,
    },
    values: { attack: 1, health: 0 },
  });
  const paid = play(s);
  const n = select(paid);
  assert.ok(n.targetingState);
  assert.equal(n.targetingState?.programPaid, undefined);
  const result = executeAction(n, {
    type: "CANCEL_EFFECT_TARGET",
    playerId: "player-1",
  });
  assert.ok(result.success);
  assert.equal(result.state.players[0].currentGold, 1);
  assert.equal(result.state.players[0].board[0]?.currentAttack, 4);
  assert.equal(result.state.players[0].hand.length, 0);
});
test("separate program groups pay independently and continue in order", () => {
  const s = fixture(6);
  s.players[0].hand[0].abilities[0].effects.push(program);
  const first = select(play(s));
  assert.equal(first.players[0].currentGold, 2);
  const n = select(first);
  assert.equal(n.players[0].board[0]?.currentAttack, 6);
  assert.equal(
    n.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    2,
  );
  assert.equal(n.targetingState, undefined);
});
test("BUFF from upgrade triggers existing stat-change chain once", () => {
  const s = fixture();
  s.players[0].board[0]!.abilities = [
    { trigger: "STAT_CHANGED", effects: [{ type: "GAIN_GOLD", amount: 1 }] },
  ];
  const n = select(play(s));
  assert.equal(n.players[0].currentGold, 2);
  assert.equal(
    n.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    1,
  );
});
test("unavailable summon skips program without payment", () => {
  const s = fixture(2);
  s.players[0].board = s.players[0].board.map(
    (card, i) =>
      card ?? {
        ...generateCardInstance(ally, { instanceId: "block" + i }),
        boardSlot: i,
      },
  ) as any;
  const n = applyEffect(s, "player-1", s.players[0].hand[0], {
    type: "STRUCTURED",
    action: "PROGRAM",
    values: {
      programCost: 2,
      programEffects: [
        {
          action: "SUMMON",
          values: { definitionRef: { id: ally.id }, count: 1 },
        },
      ],
    },
  });
  assert.equal(n.players[0].currentGold, 2);
  assert.equal(
    n.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    0,
  );
});
test("AI values affordable upgrade lethal, but chooses stronger body when upgrade is unaffordable", () => {
  for (const gold of [2, 3, 4]) {
    const s = fixture(gold, false);
    s.players[0].champion!.abilityUsedThisTurn = true;
    s.players[1].health = 3;
    s.players[1].champion!.health = 3;
    s.players[0].hand[0].abilities = [
      {
        trigger: "ENTER_FIELD",
        effects: [
          {
            type: "STRUCTURED",
            action: "PROGRAM",
            values: {
              programCost: 2,
              programEffects: [
                {
                  action: "DAMAGE",
                  target: {
                    zone: "PLAYER",
                    owner: "ENEMY",
                    selection: "ALL",
                    count: 1,
                  },
                  values: { amount: 3 },
                },
              ],
            },
          },
        ],
      },
    ];
    s.players[0].hand.push(
      generateCardInstance(
        { ...ally, id: "qa-body", cost: 2, attack: 7, health: 7 },
        { instanceId: "body" },
      ),
    );
    const chosen = chooseBestAction(
      s,
      getLegalActions(s, "player-1"),
      "player-1",
    );
    assert.equal(chosen.type, "PLAY_WRESTLER");
    assert.equal(
      (chosen as any).cardInstanceId,
      gold >= 3 ? "program" : "body",
    );
    if (gold >= 3) {
      const n = executeAction(s, chosen);
      assert.ok(n.success);
      assert.equal(n.state.winnerId, "player-1");
      assert.equal(n.state.players[0].currentGold, gold - 3);
    }
  }
});
test("Tower uses the same payment and target interpreter under field restrictions", () => {
  const s = fixture();
  s.tower = {
    playerId: "player-1",
    relics: [{ id: "two", effectType: "MAX_FIELD_TWO", values: {} }],
  } as any;
  const n = select(play(s));
  assert.equal(n.players[0].currentGold, 1);
  assert.equal(n.players[0].board[0]?.currentAttack, 4);
  assert.equal(
    n.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    1,
  );
});
test("dedupe identity does not change when another entry ability condition changes", () => {
  const s = fixture();
  s.players[0].hand[0].abilities.unshift({
    trigger: "ENTER_FIELD",
    condition: { type: "HAND_COUNT", compare: "EQ", amount: 0 },
    effects: [{ type: "GAIN_GOLD", amount: 0 }],
  });
  const n = select(play(s));
  n.players[0].currentGold = 6;
  n.players[0].hand = [
    generateCardInstance(ally, { instanceId: "extra-hand" }),
  ];
  const replay = resolveTriggeredAbilities(
    n,
    "player-1",
    n.players[0].board[1]!,
    "ENTER_FIELD",
  );
  assert.equal(replay.players[0].currentGold, 6);
  assert.equal(replay.targetingState, undefined);
  assert.equal(
    replay.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    1,
  );
});

test("a future spell can reuse automatic paid targeting without an activation approval stage", () => {
  const s = fixture(3);
  s.players[0].hand[0].cardType = "TECHNIQUE";
  s.players[0].hand[0].currentCost = 1;
  s.players[0].hand[0].abilities = [
    { trigger: "ACTIVE", effects: [structuredClone(program)] },
  ];
  const result = executeAction(s, {
    type: "BEGIN_TARGETED_ACTION",
    playerId: "player-1",
    action: { type: "PLAY_TECHNIQUE", cardInstanceId: "program" },
  });
  assert.ok(result.success, JSON.stringify(result));
  assert.equal(result.state.players[0].currentGold, 1);
  assert.equal(result.state.players[0].hand.length, 0);
  assert.equal(result.state.targetingState?.phase, undefined);
  assert.equal(result.state.targetingState?.programPaid, true);
  assert.equal(select(result.state).players[0].board[0]?.currentAttack, 4);
});

test("costless authoring and legacy 0/2/999 all pay exactly one gold", () => {
  for(const cost of [undefined,0,2,999]){
    const s=fixture(3);const values=(s.players[0].hand[0].abilities[0].effects[0] as any).values;
    if(cost===undefined)delete values.programCost;else values.programCost=cost;
    const n=select(play(s));assert.equal(n.players[0].currentGold,0);
    assert.equal(n.events.find(e=>e.type==='PROGRAM_ACTIVATED')?.amount,1);
  }
});
