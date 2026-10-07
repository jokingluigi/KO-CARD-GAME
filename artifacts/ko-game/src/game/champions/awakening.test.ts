import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../engine/create-initial-game-state";
import {
  generateCardInstance,
  isEligibleForRandomPool,
} from "../cards/generation";
import { executeAction } from "../actions/engine-actions";
import {
  applyEffect,
  resolveTriggeredAbilities,
} from "../effects/effect-engine";
import { drawCard } from "../engine/draw-card";
import { silenceCard } from "../engine/card-status";
import { resetCardAfterLeavingBoard } from "../cards/zone-state";
import { chooseBestAction } from "../actions/ai-evaluator";
import { validateCardDefinitionReferences } from "../engine/card-definition-validation";
import {
  createAwakeningCards,
  withCrisisAwakeningQuest,
} from "./awakening-definitions";
import {
  checkpointAwakening,
  hasAwakeningInvulnerability,
  reconcileAwakeningSequences,
  resolveAwakeningCounter,
} from "./awakening";
import { processChampionQuestEvents } from "./quests";
import type { CardDefinition } from "../cards/types";
import type { CardEffect } from "../effects/types";
import type { AwakeningStage } from "./awakening-types";

const basic: CardDefinition = {
  id: "basic",
  name: "basic",
  cardType: "WRESTLER",
  cost: 1,
  attack: 2,
  health: 20,
  rulesText: "",
  keywords: [],
  abilities: [],
  isToken: false,
  isChampionToken: false,
  status: "PUBLISHED",
};
const source = generateCardInstance(basic, { instanceId: "source" });
function fixture(hp = 8, owner = "player-1") {
  const state = createInitialGameState(
    undefined,
    [basic],
    undefined,
    undefined,
    { randomSeed: 42, minionACardPool: createAwakeningCards() },
  );
  state.status = "IN_PROGRESS";
  state.turn = 2;
  state.activePlayerId = owner === "player-1" ? "player-2" : "player-1";
  state.events = [];
  for (const p of state.players) {
    p.hand = [];
    p.board = [null, null, null, null];
    p.champion!.quest = null;
    p.currentGold = 10;
  }
  const p = state.players.find((p) => p.id === owner)!;
  p.health = hp;
  p.champion!.health = hp;
  p.champion!.quest = withCrisisAwakeningQuest(
    { ...p.champion! },
    "WAIT_WITHOUT_INVULNERABILITY",
  ).quest;
  p.champion!.questProgress = 0;
  p.champion!.questCompleted = false;
  return state;
}
const owner = (state: ReturnType<typeof fixture>) =>
  state.players.find((p) => p.champion?.quest?.awakening)!;
const stage = (state: ReturnType<typeof fixture>) =>
  owner(state).board.find(
    (c) =>
      c?.instanceId === owner(state).champion!.awakening?.activeStageInstanceId,
  )!;
function damage(state: ReturnType<typeof fixture>, amount: number) {
  const p = owner(state);
  return applyEffect(
    state,
    state.players.find((q) => q.id !== p.id)!.id,
    source,
    { type: "DAMAGE_OPPONENT_CHAMPION", amount },
  );
}
function remove(
  state: ReturnType<typeof fixture>,
  action: Extract<CardEffect, { type: "STRUCTURED" }>["action"] = "RETIRE",
) {
  return applyEffect(state, owner(state).id, stage(state), {
    type: "STRUCTURED",
    action,
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
}
function awaken(hp = 2, id = "player-1") {
  const s = fixture(hp, id);
  return checkpointAwakening(s, s);
}
function advance(state: ReturnType<typeof fixture>, wanted: AwakeningStage) {
  while (owner(state).champion!.awakening!.stage !== wanted)
    state = remove(state);
  return state;
}
for (const seat of ["player-1", "player-2"])
  for (let hp = 1; hp <= 6; hp++)
    test(`surviving HP ${hp}, opponent turn, ${seat}`, () => {
      const result = damage(fixture(8, seat), 8 - hp),
        p = owner(result);
      assert.equal(p.champion!.questCompleted, hp <= 5);
      if (hp <= 5) {
        assert.equal(p.champion!.awakening!.awakeningPower, 5 - hp);
        assert.equal(stage(result).currentAttack, 8 - hp);
        assert.equal(stage(result).currentHealth, 12 - hp);
        assert.ok(hasAwakeningInvulnerability(result, seat));
      }
    });
test("lethal HP0 preserves defeat and never awakens", () => {
  const result = damage(fixture(6), 6);
  assert.equal(result.status, "FINISHED");
  assert.equal(owner(result).champion!.questCompleted, false);
  assert.equal(owner(result).champion!.awakening, undefined);
});
test("silence during combat disables counter even when a later trigger retires the tank", () => {
  const s = awaken(),
    tank = stage(s);
  const effects: CardEffect[] = ["SILENCE", "RETIRE"].map((action) => ({
    type: "STRUCTURED",
    action: action as "SILENCE" | "RETIRE",
    target: { zone: "BOARD", owner: "ENEMY", selection: "ALL", count: 4 },
  }));
  s.players[1].board[0] = {
    ...generateCardInstance(
      { ...basic, abilities: [{ trigger: "SELF_ATTACK", effects }] },
      { instanceId: "attacker" },
    ),
    boardSlot: 0,
  };
  const r = executeAction(s, {
    type: "ATTACK",
    playerId: "player-2",
    attackerInstanceId: "attacker",
    target: {
      type: "WRESTLER",
      playerId: "player-1",
      cardInstanceId: tank.instanceId,
    },
  });
  assert.ok(r.success);
  assert.equal(r.state.players[1].board[0]?.currentHealth, 14);
  assert.equal(stage(r.state).awakening?.stage, "HEALER");
});
test("persisted awakening requires all three authoritative exclusive card definitions", () => {
  const s = awaken();
  assert.doesNotThrow(() => validateCardDefinitionReferences(s));
  s.cardPool = s.cardPool!.filter((d) => d.awakeningStage !== "DEALER");
  assert.throws(() => validateCardDefinitionReferences(s), /전용 선수 정의/);
});
for (let power = 0; power <= 4; power++)
  test(`snapshot and all stage base stats +${power}`, () => {
    let s = awaken(5 - power);
    const p = owner(s);
    s = applyEffect(s, p.id, source, {
      type: "STRUCTURED",
      action: "HEAL",
      target: { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 },
      values: { amount: 20 },
    });
    for (const [wanted, a, h] of [
      ["TANK", 3, 7],
      ["HEALER", 3, 5],
      ["DEALER", 6, 4],
    ] as const) {
      s = advance(s, wanted);
      assert.equal(stage(s).currentAttack, a + power);
      assert.equal(stage(s).maxHealth, h + power);
      assert.equal(owner(s).champion!.awakening!.awakeningPower, power);
    }
  });
for (const action of [
  "RETIRE",
  "DESTROY",
  "REMOVE_FROM_GAME",
  "MOVE_TO_HAND",
  "MOVE_TO_DECK",
] as const)
  test(`${action} advances all stages once and ends protection`, () => {
    let s = awaken();
    for (const nextStage of ["HEALER", "DEALER", "FINISHED"]) {
      const old = stage(s).instanceId,
        events = s.events.length,
        grave = owner(s).graveyard.length;
      s = remove(s, action);
      assert.equal(owner(s).champion!.awakening!.stage, nextStage);
      if (action === "DESTROY") {
        assert.equal(owner(s).graveyard.length, grave);
        assert.equal(
          s.events.slice(events).filter((e) => e.type === "CARD_RETIRED")
            .length,
          0,
        );
      }
      const replay = reconcileAwakeningSequences(JSON.parse(JSON.stringify(s)));
      assert.equal(replay.events.length, s.events.length);
      assert.equal(
        owner(s).board.filter((c) => c?.instanceId === old).length,
        0,
      );
      s = replay;
    }
    assert.equal(hasAwakeningInvulnerability(s, owner(s).id), false);
    assert.equal(owner(damage(s, 1)).health, 1);
  });
test("full board waits without protection, resumes once when an ordinary slot opens", () => {
  let s = fixture(2);
  const p = owner(s);
  p.board = p.board.map((_, slot) => ({
    ...generateCardInstance(basic, { instanceId: `f${slot}` }),
    boardSlot: slot,
  })) as typeof p.board;
  s = checkpointAwakening(s, s);
  assert.equal(owner(s).champion!.awakening!.pendingStage, true);
  assert.equal(hasAwakeningInvulnerability(s, p.id), false);
  s = applyEffect(s, p.id, owner(s).board[0]!, {
    type: "STRUCTURED",
    action: "DESTROY",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
  assert.equal(stage(s).awakening?.stage, "TANK");
  assert.ok(hasAwakeningInvulnerability(s, p.id));
  assert.equal(reconcileAwakeningSequences(s).events.length, s.events.length);
});
for (const wanted of ["TANK", "HEALER", "DEALER"] as const)
  test(`${wanted}: all incoming damage is prevented without damage records; reconnect preserves state`, () => {
    let s = advance(awaken(), wanted);
    const p = owner(s),
      start = s.events.length;
    s = damage(s, 99);
    s = applyEffect(s, p.id, source, {
      type: "STRUCTURED",
      action: "DAMAGE",
      target: { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 },
      values: { amount: 99 },
    });
    s = {
      ...s,
      players: s.players.map((q) => (q.id === p.id ? { ...q, deck: [] } : q)),
    };
    s = drawCard(s, p.id);
    assert.equal(owner(s).health, 2);
    assert.equal(
      s.events.slice(start).filter((e) => e.type === "DAMAGE_DEALT").length,
      0,
    );
    const restored = JSON.parse(JSON.stringify(s));
    assert.deepEqual(
      reconcileAwakeningSequences(restored),
      JSON.parse(JSON.stringify(s)),
    );
  });
test("champion remains a legal attack target while invulnerable", () => {
  const s = awaken();
  s.players[1].board[0] = {
    ...generateCardInstance(basic, { instanceId: "attacker" }),
    boardSlot: 0,
  };
  const r = executeAction(s, {
    type: "ATTACK",
    playerId: "player-2",
    attackerInstanceId: "attacker",
    target: { type: "PLAYER", playerId: "player-1" },
  });
  assert.ok(r.success);
  assert.equal(owner(r.state).health, 2);
  assert.equal(
    r.state.events.filter((e) => e.type === "DAMAGE_DEALT").length,
    0,
  );
});
test("tank counter resolves once after lethal combat before healer appears", () => {
  const s = awaken();
  s.players[1].board[0] = {
    ...generateCardInstance(
      { ...basic, attack: 40 },
      { instanceId: "attacker" },
    ),
    boardSlot: 0,
  };
  const tank = stage(s);
  const r = executeAction(s, {
    type: "ATTACK",
    playerId: "player-2",
    attackerInstanceId: "attacker",
    target: {
      type: "WRESTLER",
      playerId: "player-1",
      cardInstanceId: tank.instanceId,
    },
  });
  assert.ok(r.success);
  assert.equal(r.state.players[1].board[0]?.currentHealth, 10);
  assert.equal(stage(r.state).awakening?.stage, "HEALER");
  assert.equal(
    r.state.events.filter(
      (e) =>
        e.type === "DAMAGE_DEALT" &&
        e.reason === "CARD_EFFECT" &&
        e.source?.type === "CARD" &&
        e.source.cardInstanceId === tank.instanceId,
    ).length,
    1,
  );
});
test("healer heals own champion, self and allies by three with ordinary maximums", () => {
  const s = advance(awaken(), "HEALER"),
    p = owner(s);
  p.board[1] = {
    ...generateCardInstance(basic, { instanceId: "ally" }),
    boardSlot: 1,
    currentHealth: 18,
  };
  p.board[0] = { ...p.board[0]!, currentHealth: 2 };
  const r = resolveTriggeredAbilities(s, p.id, stage(s), "TURN_END");
  assert.equal(owner(r).health, 5);
  assert.equal(stage(r).currentHealth, 5);
  assert.equal(owner(r).board[1]?.currentHealth, 20);
});
test("dedicated cards cannot enter either random pool", () => {
  for (const c of createAwakeningCards()) {
    assert.equal(isEligibleForRandomPool(c, "STANDARD"), false);
    assert.equal(isEligibleForRandomPool(c, "FULL"), false);
  }
});

for (const wanted of ["TANK", "HEALER", "DEALER"] as const)
  test(`${wanted} silence preserves awakened bases and sequence while disabling passive`, () => {
    let s = advance(awaken(), wanted),
      p = owner(s),
      c = stage(s);
    s = silenceCard(s, c.instanceId);
    c = stage(s);
    assert.equal(c.currentAttack, c.awakening!.baseAttack);
    assert.equal(c.maxHealth, c.awakening!.baseHealth);
    const hp = p.health;
    if (wanted === "HEALER")
      assert.equal(
        owner(resolveTriggeredAbilities(s, p.id, c, "TURN_END")).health,
        hp,
      );
    const reset = resetCardAfterLeavingBoard(
      { ...c, currentAttack: c.currentAttack + 2, maxHealth: c.maxHealth + 2 },
      s.cardPool?.find((d) => d.id === c.definitionId),
    );
    assert.equal(reset.currentAttack, c.awakening!.baseAttack);
    assert.equal(reset.maxHealth, c.awakening!.baseHealth);
    s = remove(s, "DESTROY");
    assert.equal(
      owner(s).champion!.awakening!.stage,
      wanted === "TANK"
        ? "HEALER"
        : wanted === "HEALER"
          ? "DEALER"
          : "FINISHED",
    );
  });
for (const silenced of [false, true])
  test(`dealer pierce ignores only effect armor, normal combat still reduces, silence=${silenced}`, () => {
    let s = advance(awaken(), "DEALER");
    s.activePlayerId = "player-1";
    const c = stage(s);
    owner(s).board[0] = { ...c, enteredThisTurn: false, enteredOnTurn: 0 };
    if (silenced) s = silenceCard(s, c.instanceId);
    const armored = {
      ...basic,
      id: "armored",
      keywords: ["ARMOR" as const],
      effectConfig: { armor: 2 },
    };
    s.cardPool!.push(armored);
    s.players[1].board[0] = {
      ...generateCardInstance(armored, { instanceId: "enemy" }),
      boardSlot: 0,
    };
    const start = s.events.length,
      r = executeAction(s, {
        type: "ATTACK",
        playerId: "player-1",
        attackerInstanceId: c.instanceId,
        target: {
          type: "WRESTLER",
          playerId: "player-2",
          cardInstanceId: "enemy",
        },
      });
    assert.ok(r.success);
    assert.equal(r.state.players[1].board[0]?.currentHealth, silenced ? 13 : 9);
    assert.equal(
      r.state.events.slice(start).filter((e) => e.type === "ATTACK_DECLARED")
        .length,
      1,
    );
  });
test("dealer prehit lethal consumes attack without retaliation or duplicate declaration", () => {
  const s = advance(awaken(), "DEALER");
  s.activePlayerId = "player-1";
  const c = stage(s);
  owner(s).board[0] = { ...c, enteredThisTurn: false, enteredOnTurn: 0 };
  s.players[1].board[0] = {
    ...generateCardInstance(
      { ...basic, attack: 30, health: 4 },
      { instanceId: "enemy" },
    ),
    boardSlot: 0,
  };
  const r = executeAction(s, {
    type: "ATTACK",
    playerId: "player-1",
    attackerInstanceId: c.instanceId,
    target: { type: "WRESTLER", playerId: "player-2", cardInstanceId: "enemy" },
  });
  assert.ok(r.success);
  assert.equal(stage(r.state).currentHealth, 7);
  assert.equal(stage(r.state).attacksUsedThisTurn, 1);
  assert.equal(r.state.players[1].board[0], null);
});

test("self damage at 6 HP activates immediately and snapshots before subsequent healing", () => {
  const s = fixture(6),
    p = owner(s);
  const r = applyEffect(s, p.id, source, {
    type: "STRUCTURED",
    action: "DAMAGE",
    target: { zone: "PLAYER", owner: "SELF", selection: "SELF", count: 1 },
    values: { amount: 1 },
  });
  assert.equal(owner(r).champion!.questCompleted, true);
  assert.equal(owner(r).champion!.awakening!.awakeningPower, 0);
});
for (const cause of ["effect", "own-attack", "silenced-defense"] as const)
  test(`tank never counters for ${cause}`, () => {
    let s = awaken();
    const c = stage(s);
    s.players[1].board[0] = {
      ...generateCardInstance(basic, { instanceId: "enemy" }),
      boardSlot: 0,
    };
    if (cause === "effect")
      s = applyEffect(
        s,
        "player-2",
        source,
        {
          type: "STRUCTURED",
          action: "DAMAGE",
          target: {
            zone: "BOARD",
            owner: "ENEMY",
            selection: "SAME_TARGET",
            count: 1,
          },
          values: { amount: 1 },
        },
        [c.instanceId],
      );
    else {
      if (cause === "own-attack") {
        s.activePlayerId = "player-1";
        owner(s).board[0] = { ...c, enteredThisTurn: false };
      } else s = silenceCard(s, c.instanceId);
      const r = executeAction(s, {
        type: "ATTACK",
        playerId: cause === "own-attack" ? "player-1" : "player-2",
        attackerInstanceId: cause === "own-attack" ? c.instanceId : "enemy",
        target: {
          type: "WRESTLER",
          playerId: cause === "own-attack" ? "player-2" : "player-1",
          cardInstanceId: cause === "own-attack" ? "enemy" : c.instanceId,
        },
      });
      assert.ok(r.success);
      s = r.state;
    }
    assert.equal(
      s.events.filter(
        (e) =>
          e.type === "DAMAGE_DEALT" &&
          e.reason === "CARD_EFFECT" &&
          e.source?.type === "CARD" &&
          e.source.cardInstanceId === c.instanceId,
      ).length,
      0,
    );
  });
test("healer does not heal on opponent turn end", () => {
  const s = advance(awaken(), "HEALER"),
    r = executeAction(s, { type: "END_TURN", playerId: "player-2" });
  assert.ok(r.success);
  assert.equal(owner(r.state).health, 2);
});
test("dealer respects invalid target and defensive target legality", () => {
  const s = advance(awaken(), "DEALER");
  s.activePlayerId = "player-1";
  const c = stage(s);
  owner(s).board[0] = { ...c, enteredThisTurn: false };
  const def = { ...basic, keywords: ["DEFENSE" as const] };
  s.players[1].board[0] = {
    ...generateCardInstance(def, { instanceId: "defense" }),
    boardSlot: 0,
    entryDefenseActive: true,
    enteredOnTurn: s.turn,
  };
  for (const id of ["missing", "defense"]) {
    const r = executeAction(s, {
      type: "ATTACK",
      playerId: "player-1",
      attackerInstanceId: c.instanceId,
      target: { type: "WRESTLER", playerId: "player-2", cardInstanceId: id },
    });
    assert.equal(r.success, false);
    assert.deepEqual(r.state, s);
  }
});
test("transform ends membership even when instance id survives and waits without immortality on a full field", () => {
  let s = awaken();
  const p = owner(s);
  for (let i = 1; i < 4; i++)
    p.board[i] = {
      ...generateCardInstance(basic, { instanceId: `f${i}` }),
      boardSlot: i,
    };
  s = applyEffect(s, p.id, stage(s), {
    type: "STRUCTURED",
    action: "TRANSFORM_TARGET",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
    values: { definitionRef: { id: basic.id } },
  });
  assert.equal(owner(s).champion!.awakening!.stage, "HEALER");
  assert.equal(owner(s).champion!.awakening!.pendingStage, true);
  assert.equal(hasAwakeningInvulnerability(s, p.id), false);
  s = applyEffect(s, p.id, owner(s).board[1]!, {
    type: "STRUCTURED",
    action: "DESTROY",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
  assert.equal(stage(s).awakening?.stage, "HEALER");
  assert.equal(
    owner(s).board.filter((c) => c?.awakening?.stage === "HEALER").length,
    1,
  );
});
for (const difficulty of [undefined, "NORMAL", "HARD", "BOSS"] as const)
  test(`AI ${difficulty ?? "legacy"} targets the active stage over an invulnerable champion`, () => {
    const s = awaken();
    s.players[1].board[0] = {
      ...generateCardInstance(
        { ...basic, attack: 40 },
        { instanceId: "attacker" },
      ),
      boardSlot: 0,
    };
    const actions = [
      {
        type: "ATTACK" as const,
        playerId: "player-2",
        attackerInstanceId: "attacker",
        target: { type: "PLAYER" as const, playerId: "player-1" },
      },
      {
        type: "ATTACK" as const,
        playerId: "player-2",
        attackerInstanceId: "attacker",
        target: {
          type: "WRESTLER" as const,
          playerId: "player-1",
          cardInstanceId: stage(s).instanceId,
        },
      },
      { type: "END_TURN" as const, playerId: "player-2" },
    ];
    const selected = chooseBestAction(s, actions, "player-2", difficulty);
    assert.equal(selected.type, "ATTACK");
    assert.equal(
      selected.type === "ATTACK" && selected.target.type,
      "WRESTLER",
    );
  });
test("healer uses existing overheal conversion instead of a separate HP increase", () => {
  const s = advance(awaken(), "HEALER"),
    p = owner(s);
  p.health = 19;
  p.champion!.health = 19;
  p.board[1] = {
    ...generateCardInstance(
      { ...basic, contentRule: "카스토" },
      { instanceId: "casto" },
    ),
    boardSlot: 1,
  };
  p.board[0] = { ...p.board[0]!, currentHealth: 7 };
  const r = resolveTriggeredAbilities(s, p.id, stage(s), "TURN_END");
  assert.equal(owner(r).health, 22);
  assert.equal(owner(r).maxHealth, 22);
  assert.equal(stage(r).currentHealth, 10);
  assert.equal(stage(r).maxHealth, 10);
  assert.equal(owner(r).board[1]?.currentHealth, 23);
  assert.equal(owner(r).board[1]?.maxHealth, 23);
});
test("full-field pending has no immortality and cannot cancel defeat", () => {
  let s = fixture(2);
  const p = owner(s);
  p.board = p.board.map((_, slot) => ({
    ...generateCardInstance(basic, { instanceId: `f${slot}` }),
    boardSlot: slot,
  })) as typeof p.board;
  s = checkpointAwakening(s, s);
  s = damage(s, 3);
  assert.equal(s.status, "FINISHED");
  assert.equal(owner(s).champion!.awakening!.sequenceActive, false);
  assert.equal(owner(s).champion!.awakening!.championInvulnerable, false);
});
test("FULL random targeting can hit an existing exclusive stage but ordinary generation cannot create it", () => {
  let s = awaken(),
    c = stage(s),
    hp = c.currentHealth;
  s = applyEffect(s, "player-2", source, {
    type: "STRUCTURED",
    action: "DAMAGE",
    target: {
      zone: "BOARD",
      owner: "ENEMY",
      selection: "RANDOM",
      randomScope: "FULL",
      count: 1,
    },
    values: { amount: 1 },
  });
  assert.equal(stage(s).currentHealth, hp - 1);
  const r = applyEffect(s, "player-2", source, {
    type: "STRUCTURED",
    action: "SUMMON",
    values: { definitionRef: { id: c.definitionId }, count: 1 },
  });
  assert.equal(r.players[1].board.filter(Boolean).length, 0);
});
test("normal combat triggers retire the tank normally, then counter finishes before healer generation", () => {
  const s = awaken(),
    tank = stage(s);
  const attacker = {
    ...basic,
    abilities: [
      {
        trigger: "SELF_ATTACK" as const,
        effects: [
          {
            type: "STRUCTURED" as const,
            action: "RETIRE" as const,
            target: {
              zone: "BOARD" as const,
              owner: "ENEMY" as const,
              selection: "ALL" as const,
              count: 4,
            },
          },
        ],
      },
    ],
  };
  s.players[1].board[0] = {
    ...generateCardInstance(attacker, { instanceId: "attacker" }),
    boardSlot: 0,
  };
  const r = executeAction(s, {
    type: "ATTACK",
    playerId: "player-2",
    attackerInstanceId: "attacker",
    target: {
      type: "WRESTLER",
      playerId: "player-1",
      cardInstanceId: tank.instanceId,
    },
  });
  assert.ok(r.success);
  assert.equal(r.state.players[1].board[0]?.currentHealth, 10);
  const retired = r.state.events.findIndex(
    (e) => e.type === "CARD_RETIRED" && e.cardInstanceId === tank.instanceId,
  );
  const counter = r.state.events.findIndex(
    (e) =>
      e.type === "DAMAGE_DEALT" &&
      e.reason === "CARD_EFFECT" &&
      e.source?.type === "CARD" &&
      e.source.cardInstanceId === tank.instanceId,
  );
  const summoned = r.state.events.findIndex(
    (e) =>
      e.type === "CARD_GENERATED" &&
      e.cardInstanceId === stage(r.state).instanceId,
  );
  assert.ok(retired >= 0 && counter > retired && summoned > counter);
  const combatId = r.state.events.find((e) => e.reason === "COMBAT")!
    .sourceContext!.rootSourceEventId!;
  assert.equal(
    resolveAwakeningCounter(r.state, "player-1", tank, "attacker", combatId)
      .events.length,
    r.state.events.length,
  );
});
for (let power = 0; power <= 4; power++)
  test(`counter and pierce damage are exactly ${1 + power}, healer remains fixed three`, () => {
    let s = awaken(5 - power),
      c = stage(s);
    s.players[1].board[0] = {
      ...generateCardInstance(basic, { instanceId: "enemy" }),
      boardSlot: 0,
    };
    let r = executeAction(s, {
      type: "ATTACK",
      playerId: "player-2",
      attackerInstanceId: "enemy",
      target: {
        type: "WRESTLER",
        playerId: "player-1",
        cardInstanceId: c.instanceId,
      },
    });
    assert.ok(r.success);
    assert.equal(
      r.state.players[1].board[0]?.currentHealth,
      20 - (3 + power) - (1 + power),
    );
    s = advance(r.state, "HEALER");
    const hp = owner(s).health;
    s = resolveTriggeredAbilities(s, "player-1", stage(s), "TURN_END");
    assert.equal(owner(s).health, hp + 3);
    s = advance(s, "DEALER");
    s.activePlayerId = "player-1";
    c = stage(s);
    owner(s).board[0] = { ...c, enteredThisTurn: false };
    s.players[1].board[0] = {
      ...generateCardInstance(
        { ...basic, health: 40 },
        { instanceId: "enemy-2" },
      ),
      boardSlot: 0,
    };
    r = executeAction(s, {
      type: "ATTACK",
      playerId: "player-1",
      attackerInstanceId: c.instanceId,
      target: {
        type: "WRESTLER",
        playerId: "player-2",
        cardInstanceId: "enemy-2",
      },
    });
    assert.ok(r.success);
    assert.equal(
      r.state.players[1].board[0]?.currentHealth,
      40 - (6 + power) - (1 + power),
    );
  });

for(const fullHand of [false,true]) test('full-field awakening offers return choice and activates protection only after selection handFull='+fullHand,()=>{
 let s=fixture(2);const p=owner(s);for(const i of [0,1,2,3] as const)p.board[i]={...generateCardInstance(basic,{instanceId:'choice-'+i}),boardSlot:i};
 if(fullHand)p.hand=Array.from({length:7},(_,i)=>generateCardInstance(basic,{instanceId:'full-'+i}));
 s=checkpointAwakening(s,s);assert.ok(s.targetingState?.championRewardReplacement);assert.equal(hasAwakeningInvulnerability(s,p.id),false);
 const replay=checkpointAwakening(s,s);assert.equal(replay.events.filter(e=>e.type==='CARD_GENERATED').length,1);
 const r=executeAction(JSON.parse(JSON.stringify(replay)),{type:'SELECT_EFFECT_TARGET',playerId:p.id,targetId:'choice-2'});assert.ok(r.success);
 assert.equal(stage(r.state).awakening?.stage,'TANK');assert.equal(stage(r.state).currentAttack,6);assert.equal(hasAwakeningInvulnerability(r.state,p.id),true);
 assert.equal(fullHand?owner(r.state).deck[0].instanceId:owner(r.state).hand.at(-1)?.instanceId,'choice-2');assert.ok(!r.state.targetingState);
});
