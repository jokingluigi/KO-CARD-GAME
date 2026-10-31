import test from "node:test";
import assert from "node:assert/strict";
import {
  createInitialGameState,
  generateCardInstance,
  executeAction,
  getLegalActions,
  applyEffect,
  type CardDefinition,
  type GameState,
} from "../index";
import { canUseActiveAbility } from "./card-status";
import { silenceCard } from "./card-status";
import { resetCardAfterLeavingBoard } from "../cards/zone-state";
import { projectOnlineGameState } from "../../lib/online-game-state";
const unit: CardDefinition = {
  id: "once-active",
  name: "액티브 검증 선수",
  cardType: "WRESTLER",
  cost: 1,
  attack: 1,
  health: 10,
  rulesText: "",
  isToken: false,
  isChampionToken: false,
  keywords: [],
  abilities: [
    { trigger: "ACTIVE", effects: [{ type: "GAIN_GOLD", amount: 2 }] },
  ],
};
const other: CardDefinition = {
  ...unit,
  id: "once-form",
  name: "변신 검증 선수",
};
const targeted: CardDefinition = {
  ...unit,
  id: "once-targeted",
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
          values: { attack: 1 },
        },
      ],
    },
  ],
};
function setup(def = unit) {
  const s = createInitialGameState(undefined, [unit, other, targeted]);
  s.status = "IN_PROGRESS";
  s.turn = 3;
  s.activePlayerId = "player-1";
  s.events = [];
  for (const p of s.players) {
    p.hand = [];
    p.deck = Array.from({ length: 10 }, (_, i) =>
      generateCardInstance(unit, { instanceId: p.id + "-deck-" + i }),
    );
    p.currentGold = 10;
    p.board = [null, null, null, null];
  }
  s.players[0].board[0] = {
    ...generateCardInstance(def, { instanceId: "active" }),
    boardSlot: 0,
    enteredThisTurn: false,
  };
  return s;
}
function use(s: GameState, id = "active") {
  return executeAction(s, {
    type: "USE_ACTIVE",
    playerId: "player-1",
    cardInstanceId: id,
  });
}
function nextOwnTurn(s: GameState) {
  for (let i = 0; i < 2; i++) {
    const r = executeAction(s, {
      type: "END_TURN",
      playerId: s.activePlayerId!,
    });
    assert.ok(r.success, r.message);
    s = r.state;
  }
  return s;
}
function unavailable(s: GameState) {
  const r = use(s);
  assert.equal(r.success, false);
  assert.equal(r.errorCode, "ACTIVE_ALREADY_USED");
  assert.equal(r.state, s);
  assert.equal(canUseActiveAbility(s, "player-1", "active"), false);
  assert.ok(
    !getLegalActions(s, "player-1").some(
      (a) => a.type === "USE_ACTIVE" && a.cardInstanceId === "active",
    ),
  );
}
test("successful active is consumed for the whole field stay, across turns and serialization", () => {
  const initial = setup(),
    gold = initial.players[0].currentGold;
  const r = use(initial);
  assert.ok(r.success);
  assert.equal(r.state.players[0].currentGold, gold + 2);
  assert.equal(initial.players[0].board[0]!.activeUsed, false);
  assert.equal(r.state.players[0].board[0]!.activeUsed, true);
  unavailable(r.state);
  const s = nextOwnTurn(JSON.parse(JSON.stringify(r.state)));
  assert.equal(s.players[0].board[0]!.activeUsedThisTurn, false);
  unavailable(s);
  const projected = projectOnlineGameState(s, "player-1")!;
  unavailable(projected);
});
test("each copy has an independent single activation", () => {
  let s = setup();
  s.players[0].board[1] = {
    ...generateCardInstance(unit, { instanceId: "second" }),
    boardSlot: 1,
    enteredThisTurn: false,
  };
  s = use(s).state;
  const r = use(s, "second");
  assert.ok(r.success);
  assert.equal(r.state.players[0].board[1]!.activeUsed, true);
  unavailable(r.state);
});
test("source and target transforms preserve consumed state instead of refreshing the active", () => {
  for (const action of ["TRANSFORM_SOURCE", "TRANSFORM_TARGET"] as const) {
    let s = nextOwnTurn(use(setup()).state);
    const c = s.players[0].board[0]!;
    s = applyEffect(s, "player-1", c, {
      type: "STRUCTURED",
      action,
      target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
      values: { definitionRef: { id: other.id } },
    });
    assert.equal(s.players[0].board[0]!.definitionId, other.id);
    unavailable(s);
  }
});
test("an active transforming its own source consumes the replacement form too", () => {
  const d: CardDefinition = {
    ...unit,
    abilities: [
      {
        trigger: "ACTIVE",
        effects: [
          {
            type: "STRUCTURED",
            action: "TRANSFORM_SOURCE",
            values: { definitionRef: { id: other.id } },
          },
        ],
      },
    ],
  };
  const r = use(setup(d));
  assert.ok(r.success);
  assert.equal(r.state.players[0].board[0]!.definitionId, other.id);
  unavailable(nextOwnTurn(r.state));
});
test("precommit cancel and invalid targets do not consume the activation; confirmed use does", () => {
  let s = setup(targeted);
  s.players[0].board[1] = {
    ...generateCardInstance(unit, { instanceId: "ally" }),
    boardSlot: 1,
    enteredThisTurn: false,
  };
  const begin = () =>
    executeAction(s, {
      type: "BEGIN_TARGETED_ACTION",
      playerId: "player-1",
      action: { type: "USE_ACTIVE", cardInstanceId: "active" },
    });
  let r = begin();
  assert.ok(r.success, r.message);
  assert.equal(r.state.players[0].board[0]!.activeUsed, false);
  const bad = executeAction(r.state, {
    type: "CONFIRM_PRECOMMIT_TARGET",
    playerId: "player-1",
    targetId: "missing",
  });
  assert.equal(bad.success, false);
  assert.equal(bad.state.players[0].board[0]!.activeUsed, false);
  const cancel = executeAction(r.state, {
    type: "CANCEL_EFFECT_TARGET",
    playerId: "player-1",
  });
  assert.ok(cancel.success);
  s = cancel.state;
  assert.equal(s.players[0].board[0]!.activeUsed, false);
  r = begin();
  const done = executeAction(r.state, {
    type: "CONFIRM_PRECOMMIT_TARGET",
    playerId: "player-1",
    targetId: "ally",
  });
  assert.ok(done.success);
  assert.equal(done.state.players[0].board[1]!.currentAttack, 2);
  unavailable(nextOwnTurn(done.state));
});
test("failed entry-turn use leaves the lifetime activation available", () => {
  const s = setup();
  s.players[0].board[0]!.enteredThisTurn = true;
  const r = use(s);
  assert.equal(r.success, false);
  assert.equal(r.state.players[0].board[0]!.activeUsed, false);
  assert.ok(use(nextOwnTurn(r.state)).success);
});
test("a legacy current-turn use is retained across the next owner turn", () => {
  const s = setup();
  delete s.players[0].board[0]!.activeUsed;
  s.players[0].board[0]!.activeUsedThisTurn = true;
  unavailable(nextOwnTurn(s));
});
test("silence and external buffs cannot clear the lifetime marker", () => {
  let s = use(setup()).state;
  const c = s.players[0].board[0]!;
  s = applyEffect(s, "player-1", c, {
    type: "STRUCTURED",
    action: "BUFF",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
    values: { attack: 3 },
  });
  assert.equal(s.players[0].board[0]!.activeUsed, true);
  s = silenceCard(s, "active");
  assert.equal(s.players[0].board[0]!.activeUsed, true);
});
test("leaving and re-entering the field begins a fresh field stay with entry cooldown", () => {
  let s = use(setup()).state;
  const c = s.players[0].board[0]!;
  const cleaned = resetCardAfterLeavingBoard(c, unit);
  assert.equal(cleaned.activeUsed, false);
  s = applyEffect(s, "player-1", c, {
    type: "STRUCTURED",
    action: "MOVE_TO_HAND",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
  assert.equal(s.players[0].hand[0].activeUsed, false);
  const played = executeAction(s, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "active",
    boardSlot: 0,
  });
  assert.ok(played.success);
  assert.equal(use(played.state).success, false);
  assert.ok(use(nextOwnTurn(played.state)).success);
});
