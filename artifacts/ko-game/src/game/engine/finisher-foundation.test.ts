import assert from "node:assert/strict";
import { test } from "node:test";
import { createInitialGameState } from "./create-initial-game-state";
import { generateCardInstance } from "../cards/generation";
import type { CardDefinition } from "../cards/types";
import {
  applyEffect,
  resolveTriggeredAbilities,
} from "../effects/effect-engine";
import { executeAction, getLegalActions } from "../actions/engine-actions";
import { drawCard } from "./draw-card";
import { startGame } from "./turn-system";
import { validateCardDefinitionReferences } from "./card-definition-validation";
import { currentChampionAbility } from "../champions/types";
import { chooseBestAction } from "../actions/ai-evaluator";
const unit: CardDefinition = {
  id: "qa-unit",
  name: "검증 선수",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 1,
  attack: 1,
  health: 3,
  rulesText: "",
  keywords: [],
  abilities: [],
};
const source = () => generateCardInstance(unit, { instanceId: "source" });
function setup(full = 7) {
  const s = createInitialGameState();
  s.status = "IN_PROGRESS";
  s.activePlayerId = "player-1";
  s.turn = 3;
  s.cardPool = [unit];
  s.players[0].currentGold = 10;
  s.players[0].hand = Array.from({ length: full }, (_, i) =>
    generateCardInstance(unit, { instanceId: "hand-" + i }),
  );
  s.players[0].deck = Array.from({ length: 4 }, (_, i) =>
    generateCardInstance(unit, { instanceId: "deck-" + i }),
  );
  return s;
}
const generate = {
  type: "STRUCTURED" as const,
  action: "GENERATE" as const,
  values: { definitionRef: { id: unit.id }, count: 1 },
};
test("automatic game-start generation can wait for a human discard before dealing opening draws", () => {
  const s = createInitialGameState();
  s.cardPool = [...(s.cardPool ?? []), unit];
  for (const p of s.players) p.champion!.quest = null;
  s.players[0].champion!.gameStartAbility = {
    id: "qa-start",
    name: "시작 검증",
    description: "검증",
    cost: 0,
    effects: [{ ...generate, values: { ...generate.values, count: 8 } }],
  };
  const n = startGame(s, () => 0.5);
  assert.ok(n.targetingState?.handAddition);
  assert.equal(n.players[0].hand.length, 7);
  assert.equal(n.players[1].hand.length, 0);
  assert.equal(n.events.filter((e) => e.type === "TURN_STARTED").length, 0);
  n.openingMulligan = true;
  const r = executeAction(JSON.parse(JSON.stringify(n)), {
    type: "SELECT_EFFECT_TARGET",
    playerId: n.players[0].id,
    targetId: n.players[0].hand[0].instanceId,
  });
  assert.ok(r.success);
  assert.equal(r.state.pendingOpening, undefined);
  assert.equal(r.state.players[0].hand.length, 7);
  assert.equal(r.state.players[1].hand.length, 4);
  assert.equal(r.state.players[0].removedFromGame.length, 4);
  assert.equal(
    r.state.events.filter((e) => e.type === "CARD_GENERATED").length,
    8,
  );
  assert.equal(
    r.state.events.filter((e) => e.type === "TURN_STARTED").length,
    1,
  );
});
test("non-draw generation with free space enters hand", () => {
  const s = applyEffect(setup(6), "player-1", source(), generate);
  assert.equal(s.players[0].hand.length, 7);
  assert.equal(s.targetingState, undefined);
});
test("persisted pending arrivals validate identities and reject duplicate cards", () => {
  const s = setup();
  for (const p of s.players) {
    p.champion!.quest = null;
    p.champion!.championTokenDefinitionId = undefined;
    if (p.id !== "player-1") {
      p.hand = [];
      p.deck = [];
    }
  }
  const pending = applyEffect(s, "player-1", source(), generate);
  assert.doesNotThrow(() => validateCardDefinitionReferences(pending));
  const bad = JSON.parse(JSON.stringify(pending));
  bad.targetingState.handAddition.cards[0].card.instanceId = "hand-0";
  assert.throws(() => validateCardDefinitionReferences(bad), /중복/);
});
test("full generation waits, rejects cancel/other actions, discards chosen existing card and resumes once after reconnect", () => {
  const s = setup(),
    card = source();
  card.abilities = [
    {
      trigger: "ACTIVE",
      effects: [
        generate,
        { type: "STRUCTURED", action: "ADD_GOLD", values: { amount: 2 } },
      ],
    },
  ];
  const pending = resolveTriggeredAbilities(s, "player-1", card, "ACTIVE");
  assert.ok(pending.targetingState?.handAddition);
  assert.equal(pending.players[0].currentGold, 10);
  assert.equal(pending.players[0].hand.length, 7);
  assert.equal(pending.players[0].removedFromGame.length, 0);
  assert.equal(
    executeAction(pending, { type: "END_TURN", playerId: "player-1" }).success,
    false,
  );
  assert.equal(
    executeAction(pending, {
      type: "CANCEL_EFFECT_TARGET",
      playerId: "player-1",
    }).success,
    false,
  );
  assert.equal(
    executeAction(pending, {
      type: "SELECT_EFFECT_TARGET",
      playerId: "player-2",
      targetId: "hand-0",
    }).success,
    false,
  );
  const r = executeAction(JSON.parse(JSON.stringify(pending)), {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "hand-0",
  });
  assert.ok(r.success);
  assert.equal(r.state.players[0].currentGold, 12);
  assert.equal(r.state.players[0].hand.length, 7);
  assert.equal(r.state.players[0].graveyard[0]?.instanceId, "hand-0");
  assert.equal(r.state.targetingState, undefined);
  assert.equal(
    r.state.events.filter((e) => e.type === "CARD_DISCARDED").length,
    1,
  );
  assert.equal(
    r.state.events.filter((e) => e.type === "CARD_RETIRED").length,
    0,
  );
  assert.equal(
    executeAction(r.state, {
      type: "SELECT_EFFECT_TARGET",
      playerId: "player-1",
      targetId: "hand-0",
    }).success,
    false,
  );
});
test("several generated cards each require one discard, with no duplicated continuation", () => {
  const s = setup(),
    card = source();
  card.abilities = [
    {
      trigger: "ACTIVE",
      effects: [
        { ...generate, values: { ...generate.values, count: 3 } },
        { type: "STRUCTURED", action: "ADD_GOLD", values: { amount: 2 } },
      ],
    },
  ];
  let n = resolveTriggeredAbilities(s, "player-1", card, "ACTIVE");
  for (let i = 0; i < 3; i++) {
    assert.ok(n.targetingState?.handAddition);
    const r = executeAction(n, {
      type: "SELECT_EFFECT_TARGET",
      playerId: "player-1",
      targetId: "hand-" + i,
    });
    assert.ok(r.success);
    n = r.state;
    assert.equal(n.players[0].hand.length, 7);
  }
  assert.equal(n.players[0].graveyard.length, 3);
  assert.equal(n.players[0].currentGold, 12);
  assert.equal(new Set(n.players[0].hand.map((c) => c.instanceId)).size, 7);
  assert.equal(n.targetingState, undefined);
});
test("draw overflow publicly reveals and removes, never enters hand or resolves CARD_DRAWN prepare effects", () => {
  const s = setup();
  s.players[0].deck[0].abilities = [
    {
      trigger: "CARD_DRAWN",
      effects: [
        { type: "STRUCTURED", action: "ADD_GOLD", values: { amount: 20 } },
      ],
    },
  ];
  const n = drawCard(s, "player-1");
  assert.equal(n.players[0].currentGold, 10);
  assert.equal(n.players[0].hand.length, 7);
  assert.equal(n.players[0].deck.length, 3);
  assert.equal(n.players[0].removedFromGame[0].instanceId, "deck-0");
  assert.equal(n.players[0].graveyard.length, 0);
  assert.equal(n.targetingState, undefined);
  assert.equal(n.events.filter((e) => e.type === "CARD_REVEALED").length, 1);
  assert.equal(
    n.events.filter((e) => e.type === "CARD_DRAWN" && e.reason === "OVERDRAW")
      .length,
    1,
  );
});
for (const space of [0, 1, 2])
  test("two draws with " + space + " spaces", () => {
    let n = setup(7 - space);
    n = drawCard(n, "player-1");
    n = drawCard(n, "player-1");
    assert.equal(n.players[0].hand.length, 7);
    assert.equal(n.players[0].removedFromGame.length, 2 - space);
    assert.equal(n.players[0].deck.length, 2);
  });
test("non-draw graveyard return uses discard decision, never deck return", () => {
  const s = setup();
  s.players[0].graveyard = [
    generateCardInstance(unit, { instanceId: "revive" }),
  ];
  const n = applyEffect(s, "player-1", source(), {
    type: "STRUCTURED",
    action: "MOVE_TO_HAND",
    target: { zone: "GRAVEYARD", owner: "SELF", selection: "ALL", count: 1 },
  });
  assert.ok(n.targetingState?.handAddition);
  assert.equal(n.players[0].graveyard.length, 0);
  const r = executeAction(n, {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "hand-0",
  });
  assert.ok(r.success);
  assert.ok(r.state.players[0].hand.some((c) => c.instanceId === "revive"));
  assert.equal(r.state.players[0].deck.length, 4);
});
test("AI completes a mandatory full-hand decision", () => {
  const n = applyEffect(setup(), "player-1", source(), generate);
  const actions = getLegalActions(n, "player-1");
  assert.equal(actions.length, 7);
  assert.ok(actions.every((a) => a.type === "SELECT_EFFECT_TARGET"));
  const action = chooseBestAction(n, actions, "player-1", "NORMAL");
  assert.ok(executeAction(n, action).success);
});
test("turn-end hand addition finishes before the next player draws or refreshes resources", () => {
  const s = setup(),
    c = source();
  c.boardSlot = 0;
  c.abilities = [{ trigger: "TURN_END", effects: [generate] }];
  s.players[0].board[0] = c;
  const r = executeAction(s, { type: "END_TURN", playerId: "player-1" });
  assert.ok(r.success);
  assert.ok(r.state.targetingState?.handAddition);
  assert.ok(r.state.pendingNextTurnStart);
  assert.equal(
    r.state.events.filter((e) => e.type === "TURN_STARTED").length,
    0,
  );
  const n = executeAction(JSON.parse(JSON.stringify(r.state)), {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "hand-0",
  });
  assert.ok(n.success);
  assert.equal(n.state.pendingNextTurnStart, undefined);
  assert.equal(
    n.state.events.filter((e) => e.type === "TURN_STARTED").length,
    1,
  );
});
test("a draw prepare which adds cards suspends the remaining draws and outer effect", () => {
  const s = setup(6),
    c = source();
  s.players[0].deck[0].abilities = [
    { trigger: "CARD_DRAWN", effects: [generate] },
  ];
  c.abilities = [
    {
      trigger: "ACTIVE",
      effects: [
        { type: "STRUCTURED", action: "DRAW", values: { amount: 2 } },
        { type: "STRUCTURED", action: "ADD_GOLD", values: { amount: 3 } },
      ],
    },
  ];
  const pending = resolveTriggeredAbilities(s, "player-1", c, "ACTIVE");
  assert.ok(pending.targetingState?.handAddition);
  assert.equal(pending.players[0].deck.length, 3);
  assert.equal(pending.players[0].currentGold, 10);
  const r = executeAction(pending, {
    type: "SELECT_EFFECT_TARGET",
    playerId: "player-1",
    targetId: "hand-0",
  });
  assert.ok(r.success);
  assert.equal(r.state.players[0].deck.length, 2);
  assert.equal(r.state.players[0].removedFromGame.length, 1);
  assert.equal(r.state.players[0].currentGold, 13);
  assert.equal(r.state.targetingState, undefined);
});
test("ability override preserves health, readiness and quest, can be replaced repeatedly and survives serialization", () => {
  const s = setup();
  assert.ok(s.players[0].champion);
  const before = structuredClone(s.players[0].champion!);
  s.players[0].championAbilityUsedThisTurn = true;
  const spec = {
    ability: {
      id: "qa-new-ability",
      name: "검증 변경 능력",
      description: "검증",
      cost: 2,
      effects: [
        {
          trigger: "ENTER_FIELD" as const,
          action: "ADD_GOLD" as const,
          values: { amount: 3 },
        },
      ],
    },
  };
  let n = applyEffect(s, "player-1", source(), {
    type: "STRUCTURED",
    action: "REPLACE_CHAMPION_ABILITY",
    values: { abilityReplacement: spec },
  });
  assert.equal(
    currentChampionAbility(n.players[0].champion)?.id,
    "qa-new-ability",
  );
  assert.equal(n.players[0].champion?.health, before.health);
  assert.equal(n.players[0].champion?.questProgress, before.questProgress);
  assert.deepEqual(n.players[0].champion?.ability, before.ability);
  assert.equal(n.players[0].championAbilityUsedThisTurn, true);
  assert.equal(
    executeAction(n, { type: "USE_CHAMPION_ABILITY", playerId: "player-1" })
      .success,
    false,
  );
  n = JSON.parse(JSON.stringify(n));
  n.players[0].championAbilityUsedThisTurn = false;
  const r = executeAction(n, {
    type: "USE_CHAMPION_ABILITY",
    playerId: "player-1",
  });
  assert.ok(r.success);
  assert.equal(r.state.players[0].currentGold, 11);
  n = applyEffect(r.state, "player-1", source(), {
    type: "STRUCTURED",
    action: "REPLACE_CHAMPION_ABILITY",
    values: { abilityReplacement: { variant: "BASE" } },
  });
  assert.equal(
    currentChampionAbility(n.players[0].champion)?.id,
    before.ability.id,
  );
  assert.equal(n.players[0].championAbilityUsedThisTurn, true);
  assert.equal(
    createInitialGameState().players[0].champion?.abilityOverride,
    undefined,
  );
});
test("AI evaluates the replacement ability, including its lethal effect", () => {
  const s = setup();
  s.players[1].health = 2;
  s.players[1].champion!.health = 2;
  const n = applyEffect(s, "player-1", source(), {
    type: "STRUCTURED",
    action: "REPLACE_CHAMPION_ABILITY",
    values: {
      abilityReplacement: {
        ability: {
          id: "qa-lethal",
          name: "검증",
          description: "검증",
          cost: 2,
          effects: [
            {
              trigger: "ENTER_FIELD",
              action: "DAMAGE",
              target: {
                zone: "PLAYER",
                owner: "ENEMY",
                selection: "ALL",
                count: 1,
              },
              values: { amount: 2 },
            },
          ],
        },
      },
    },
  });
  for (const difficulty of ["NORMAL", "HARD", "BOSS"] as const) {
    const action = chooseBestAction(
      n,
      getLegalActions(n, "player-1"),
      "player-1",
      difficulty,
    );
    assert.equal(action.type, "USE_CHAMPION_ABILITY");
    const r = executeAction(n, action);
    assert.ok(r.success);
    assert.equal(r.state.winnerId, "player-1");
  }
});
test("an optional turn-duration replacement expires without changing the original ability", () => {
  const s = setup();
  const original = s.players[0].champion!.ability.id;
  const n = applyEffect(s, "player-1", source(), {
    type: "STRUCTURED",
    action: "REPLACE_CHAMPION_ABILITY",
    values: {
      duration: "THIS_TURN",
      abilityReplacement: {
        ability: {
          id: "qa-temporary",
          name: "검증",
          description: "검증",
          cost: 2,
          effects: [
            {
              trigger: "ENTER_FIELD",
              action: "ADD_GOLD",
              values: { amount: 1 },
            },
          ],
        },
      },
    },
  });
  assert.equal(
    currentChampionAbility(n.players[0].champion)?.id,
    "qa-temporary",
  );
  const r = executeAction(n, { type: "END_TURN", playerId: "player-1" });
  assert.ok(r.success);
  assert.equal(
    currentChampionAbility(r.state.players[0].champion)?.id,
    original,
  );
});

test("a finished match cannot resume a pending discard or award the incoming card", () => {
  const pending = applyEffect(setup(), "player-1", source(), generate);
  const ended = executeAction(pending, {
    type: "SURRENDER",
    playerId: "player-1",
  });
  assert.ok(ended.success);
  assert.equal(ended.state.status, "FINISHED");
  assert.deepEqual(getLegalActions(ended.state, "player-1"), []);
  assert.equal(
    executeAction(ended.state, {
      type: "SELECT_EFFECT_TARGET",
      playerId: "player-1",
      targetId: "hand-0",
    }).success,
    false,
  );
  assert.equal(ended.state.players[0].hand.length, 7);
});
