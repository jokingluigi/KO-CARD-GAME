import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "./create-initial-game-state";
import { generateCardInstance } from "../cards/generation";
import {
  returnCardFromBoard,
  resetCardForGraveyard,
} from "../cards/zone-state";
import {
  applyEffect,
  resolveTriggeredAbilities,
} from "../effects/effect-engine";
import { executeAction, getLegalActions } from "../actions/engine-actions";
import { getAttackLegality } from "./combat";
import {
  processFinisherChoices,
  validFinisherChoices,
} from "../champions/finisher-preparation";
import { currentChampionAbility } from "../champions/types";
import { MAX_HAND_SIZE } from "../rules/constants";
import type { CardDefinition } from "../cards/types";
import type { GameState } from "../types/game-state";
import { chooseBestAction } from "../actions/ai-evaluator";
const unit: CardDefinition = {
  id: "qa-return",
  name: "검증 선수",
  cardType: "WRESTLER",
  cost: 2,
  attack: 2,
  health: 3,
  keywords: [],
  abilities: [],
  rulesText: "",
  tags: ["ZOMBIE"],
};
const finisher: CardDefinition = {
  ...unit,
  id: "qa-finisher-a",
  name: "검증용 피니셔 A",
  cardType: "TECHNIQUE",
  rarity: "CHAMPION",
  isChampionToken: true,
  isToken: true,
  abilities: [],
  rulesText: "검증 전용",
};
const second: CardDefinition = {
  ...finisher,
  id: "qa-finisher-b",
  name: "검증용 피니셔 B",
};
function setup() {
  const s = createInitialGameState(undefined, [unit, finisher, second]);
  s.status = "IN_PROGRESS";
  s.turn = 3;
  s.activePlayerId = "player-1";
  s.events = [];
  s.cardPool = [unit, finisher, second];
  for (const p of s.players) {
    p.board = [null, null, null, null];
    p.hand = [];
    p.deck = [];
    p.graveyard = [];
    p.currentGold = 6;
    p.health = 20;
    p.maxHealth = 20;
    p.champion!.quest = null;
  }
  return s;
}
function board(s: GameState) {
  const c = {
    ...generateCardInstance(unit, { instanceId: "source" }),
    boardSlot: 0 as const,
    currentAttack: 7,
    currentCost: 1,
    maxHealth: 9,
    currentHealth: 2,
    isStunned: true,
    isSilenced: true,
    temporaryCostUntilTurn: 3,
  };
  s.players[0].board[0] = c;
  return c;
}
function choices(s: GameState, same = false) {
  s.players[0].champion!.quest = {
    id: "qa-options",
    name: "피니셔 준비",
    description: "검증",
    trackedEvent: "CARD_PLAYED",
    requiredProgress: 1,
    reward: { type: "GAIN_GOLD", amount: 99 },
    finisherChoices: [
      {
        id: "a",
        name: "A",
        description: "카드 사용",
        condition: {
          type: "EVENT",
          event: "CARD_PLAYED",
          owner: "SELF",
          required: 1,
        },
        cardDefinitionId: finisher.id,
      },
      {
        id: "b",
        name: "B",
        description: "두 번째 조건",
        condition: same
          ? { type: "EVENT", event: "CARD_PLAYED", owner: "SELF", required: 1 }
          : { type: "TURN", turn: 99 },
        cardDefinitionId: second.id,
      },
    ],
  };
  return s;
}
function used(s: GameState) {
  return {
    ...s,
    events: [
      ...s.events,
      {
        type: "CARD_PLAYED" as const,
        playerId: "player-1",
        cardInstanceId: "used",
        cardType: "WRESTLER" as const,
      },
    ],
  };
}
test("field return preserves current cost/attack/max HP, fully heals and clears lifecycle statuses", () => {
  const s = setup(),
    c = board(s),
    r = returnCardFromBoard(c, unit);
  assert.deepEqual(
    [r.currentCost, r.currentAttack, r.currentHealth, r.maxHealth],
    [1, 7, 9, 9],
  );
  assert.equal(r.isStunned, false);
  assert.equal(r.isSilenced, false);
  assert.equal(r.temporaryCostUntilTurn, undefined);
  assert.deepEqual(r.temporaryStatModifiers, []);
  const dead = resetCardForGraveyard({ ...c, definitionId: "test-rush" });
  assert.notEqual(dead.currentAttack, 7);
});
for (const destination of ["MOVE_TO_HAND", "MOVE_TO_DECK"] as const)
  test(`actual ${destination} retains stats and restores health`, () => {
    const s = setup(),
      c = board(s);
    const n = applyEffect(
      s,
      "player-1",
      c,
      {
        type: "STRUCTURED",
        action: destination,
        target: {
          zone: "BOARD",
          owner: "SELF",
          selection: "SAME_TARGET",
          count: 1,
        },
      },
      ["source"],
    );
    const returned = (
      destination === "MOVE_TO_HAND" ? n.players[0].hand : n.players[0].deck
    )[0];
    assert.ok(returned);
    assert.deepEqual(
      [
        returned.currentCost,
        returned.currentAttack,
        returned.currentHealth,
        returned.maxHealth,
      ],
      [1, 7, 9, 9],
    );
    assert.equal(n.players[0].board[0], null);
    assert.equal(n.players[0].graveyard.length, 0);
  });
for (const keywords of [["RUSH", "SURPRISE"], ["RUSH"], ["SURPRISE"]] as const)
  test(`${keywords.join("+")} entry-turn champion attack legality and server action agree`, () => {
    const s = setup();
    const c = board(s);
    Object.assign(c, {
      keywords: [...keywords],
      isStunned: false,
      isSilenced: false,
      enteredThisTurn: true,
    });
    const legal = getAttackLegality(s, "player-1", c.instanceId);
    const result = executeAction(s, {
      type: "ATTACK",
      playerId: "player-1",
      attackerInstanceId: c.instanceId,
      target: { type: "PLAYER", playerId: "player-2" },
    });
    assert.equal(legal.allowed, keywords.includes("RUSH" as never));
    assert.equal(result.success, keywords.includes("RUSH" as never));
    if (result.success) {
      assert.equal(result.state.players[1].health, 13);
      assert.equal(
        executeAction(result.state, {
          type: "ATTACK",
          playerId: "player-1",
          attackerInstanceId: c.instanceId,
          target: { type: "PLAYER", playerId: "player-2" },
        }).success,
        false,
      );
    }
  });
test("one completed option locks and grants exactly that finisher; legacy reward and ability upgrade do not run", () => {
  const s = choices(setup()),
    n = processFinisherChoices(s, used(s));
  assert.equal(n.players[0].champion!.selectedFinisherId, "a");
  assert.deepEqual(
    n.players[0].hand.map((c) => c.definitionId),
    [finisher.id],
  );
  assert.equal(n.players[0].currentGold, 6);
  assert.equal(
    currentChampionAbility(n.players[0].champion)?.id,
    n.players[0].champion!.ability.id,
  );
  assert.equal(processFinisherChoices(s, n).players[0].hand.length, 1);
});
test("simultaneous conditions require an explicit durable choice; cancellation and other actions are blocked", () => {
  const s = choices(setup(), true),
    n = processFinisherChoices(s, used(s));
  assert.deepEqual(n.targetingState?.finisherChoice?.optionIds, ["a", "b"]);
  assert.equal(n.players[0].hand.length, 0);
  assert.equal(
    executeAction(n, { type: "END_TURN", playerId: "player-1" }).success,
    false,
  );
  assert.equal(
    executeAction(n, { type: "CANCEL_EFFECT_TARGET", playerId: "player-1" })
      .success,
    false,
  );
  const restored = JSON.parse(JSON.stringify(n));
  assert.equal(getLegalActions(restored, "player-1").length, 2);
  const wrong = executeAction(restored, {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-2",
    targetId: "finisher:b",
  });
  assert.equal(wrong.success, false);
  const r = executeAction(restored, {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "finisher:b",
  });
  assert.ok(r.success);
  assert.equal(r.state.players[0].champion!.selectedFinisherId, "b");
  assert.equal(r.state.players[0].hand[0].definitionId, second.id);
  assert.equal(
    executeAction(r.state, {
      type: "SELECT_EFFECT_TARGET",
      playerId: "player-1",
      targetId: "finisher:a",
    }).success,
    false,
  );
});
test("finisher awarded at full hand uses existing mandatory discard; reconnect does not duplicate it", () => {
  const s = choices(setup());
  s.players[0].hand = Array.from({ length: MAX_HAND_SIZE }, (_, i) =>
    generateCardInstance(unit, { instanceId: `h${i}` }),
  );
  const n = processFinisherChoices(s, used(s));
  assert.ok(n.targetingState?.handAddition);
  const r = executeAction(JSON.parse(JSON.stringify(n)), {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "h0",
  });
  assert.ok(r.success);
  assert.equal(r.state.players[0].hand.length, MAX_HAND_SIZE);
  assert.equal(r.state.players[0].graveyard[0].instanceId, "h0");
  assert.equal(
    r.state.players[0].hand.filter((c) => c.definitionId === finisher.id)
      .length,
    1,
  );
  assert.equal(
    processFinisherChoices(n, r.state).players[0].hand.length,
    MAX_HAND_SIZE,
  );
});
test("AI selects one of the actual prepared finishers", () => {
  const s = choices(setup(), true),
    n = processFinisherChoices(s, used(s));
  const a = chooseBestAction(n, getLegalActions(n, "player-1"), "player-1");
  assert.ok(a);
  assert.equal(a.type, "SELECT_EFFECT_TARGET");
  const r = executeAction(n, a);
  assert.ok(r.success);
  assert.equal(r.state.players[0].hand.length, 1);
});
test("choices validate ids, real conditions and minimum count", () => {
  const s = choices(setup());
  const o = s.players[0].champion!.quest!.finisherChoices!;
  assert.ok(validFinisherChoices(o));
  assert.equal(validFinisherChoices([o[0]]), false);
  assert.equal(validFinisherChoices([o[0], o[0]]), false);
  assert.equal(
    validFinisherChoices([{ ...o[0], condition: { type: "WHATEVER" } }, o[1]]),
    false,
  );
});
function presence(s: GameState, countThreshold = 0) {
  const c = board(s);
  Object.assign(c, { isSilenced: false, isStunned: false });
  return applyEffect(s, "player-1", c, {
    type: "SCRIPT",
    script: {
      version: "SCRIPT_V1",
      steps: [
        {
          type: "SELECT",
          id: "allies",
          target: {
            zone: "BOARD",
            owner: "SELF",
            selection: "ALL",
            count: 20,
            filter: { tagsAny: ["ZOMBIE"] },
          },
        },
        {
          type: "IF",
          condition: {
            left: { kind: "RESULT_COUNT", resultId: "allies" },
            compare: "GT",
            right: { kind: "CONSTANT", value: countThreshold },
          },
          then: [
            {
              type: "EFFECT",
              effect: { action: "ADD_GOLD", values: { amount: 1 } },
            },
          ],
        },
      ],
    },
  });
}
test("allied field presence excludes self, but another copy counts; explicit board totals are not changed", () => {
  let s = setup();
  assert.equal(presence(s).players[0].currentGold, 6);
  s = setup();
  s.players[0].board[1] = {
    ...generateCardInstance(unit, { instanceId: "other-copy" }),
    boardSlot: 1,
  };
  assert.equal(presence(s).players[0].currentGold, 7);
  s = setup();
  s.players[0].board[1] = {
    ...generateCardInstance(unit, { instanceId: "other-copy" }),
    boardSlot: 1,
  };
  assert.equal(presence(s, 1).players[0].currentGold, 7);
});
test("structured tag-presence and generic presence exclude source but accept another definition copy", () => {
  for (const condition of [
    { type: "BOARD_HAS_TAG", tag: "ZOMBIE" },
    { type: "BOARD_COUNT", compare: "GTE", amount: 1 },
  ] as const) {
    for (const other of [false, true]) {
      const s = setup(),
        c = board(s);
      Object.assign(c, {
        isSilenced: false,
        abilities: [
          {
            trigger: "TURN_START",
            condition,
            effects: [
              { type: "STRUCTURED", action: "ADD_GOLD", values: { amount: 1 } },
            ],
          },
        ],
      });
      if (other)
        s.players[0].board[1] = {
          ...generateCardInstance(unit, { instanceId: "copy" }),
          boardSlot: 1,
        };
      const n = resolveTriggeredAbilities(s, "player-1", c, "TURN_START");
      assert.equal(n.players[0].currentGold, other ? 7 : 6);
    }
  }
});
test("actual play defers finisher decisions until the whole action has emitted all qualifying events", () => {
  const s = choices(setup(), true);
  s.players[0].champion!.quest!.finisherChoices![1].condition = {
    type: "EVENT",
    event: "ENTER_FIELD",
    owner: "SELF",
    required: 1,
  };
  s.players[0].hand = [generateCardInstance(unit, { instanceId: "play" })];
  const r = executeAction(s, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "play",
    boardSlot: 0,
  });
  assert.ok(r.success);
  assert.deepEqual(r.state.targetingState?.finisherChoice?.optionIds, [
    "a",
    "b",
  ]);
  assert.equal(r.state.players[0].hand.length, 0);
  assert.equal(r.state.players[0].champion!.questCompleted, false);
});
test("committed intermediate target choices do not prematurely lock a partially completed finisher resolution", () => {
  const s = choices(setup(), true);
  s.players[0].champion!.quest!.finisherChoices![1].condition = {
    type: "EVENT",
    event: "DAMAGE_DEALT",
    owner: "SELF",
    required: 1,
  };
  const spell: CardDefinition = {
    ...finisher,
    id: "qa-target-spell",
    cost: 0,
    isChampionToken: false,
    rarity: "NORMAL",
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
            values: { amount: 1 },
          },
        ],
      },
    ],
  };
  s.cardPool!.push(spell);
  s.players[0].hand = [generateCardInstance(spell, { instanceId: "spell" })];
  s.players[1].board[0] = {
    ...generateCardInstance(unit, { instanceId: "enemy" }),
    boardSlot: 0,
  };
  const r = executeAction(s, {
    type: "PLAY_TECHNIQUE",
    playerId: "player-1",
    cardInstanceId: "spell",
  });
  assert.ok(r.success);
  assert.equal(r.state.players[0].champion!.selectedFinisherId, undefined);
  assert.equal(r.state.targetingState?.finisherChoice, undefined);
  assert.ok(r.state.targetingState);
  const done = executeAction(r.state, {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "enemy",
  });
  assert.ok(done.success);
  assert.equal(done.state.players[0].champion!.questCompleted, false);
  assert.deepEqual(done.state.targetingState?.finisherChoice?.optionIds, [
    "a",
    "b",
  ]);
});
