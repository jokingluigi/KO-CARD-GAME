import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  chooseBestAction,
  getLegalActions,
  cardRecordToDefinition,
  championRecordToDefinition,
  createInitialGameState,
  generateCardInstance,
  executeAction,
} from "../../lib/game-engine/src/index.ts";
import { applyEffect } from "../../artifacts/ko-game/src/game/effects/effect-engine.ts";
import { processChampionQuestEvents } from "../../artifacts/ko-game/src/game/champions/quests.ts";
import { currentChampionAbility } from "../../artifacts/ko-game/src/game/champions/types.ts";
const record = JSON.parse(
    readFileSync("docs/qa/20261113-natomato/champion-record.json"),
  )[0],
  champion = championRecordToDefinition(record);
const body = {
  id: "nato-body",
  name: "검증 선수",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 1,
  attack: 1,
  health: 30,
  abilities: [],
  keywords: [],
  rulesText: "",
};
const finisher = {
  ...body,
  id: record.questCondition.finisher.cardDefinitionId,
  name: "피니셔 지급 검증",
  cardType: "TECHNIQUE",
  isToken: true,
  isChampionToken: true,
  rarity: "CHAMPION",
  cost: 0,
};
export function fixture() {
  const s = createInitialGameState(
    [champion.id, champion.id],
    [body, finisher],
    [champion],
  );
  s.status = "IN_PROGRESS";
  s.activePlayerId = s.players[0].id;
  s.turn = 5;
  s.events = [];
  for (const [i, p] of s.players.entries()) {
    p.health = 20;
    p.maxHealth = 30;
    p.currentGold = 1;
    p.championAbilityUsedThisTurn = false;
    p.champion.questCompleted = false;
    p.hand = [];
    p.deck = Array.from({ length: 40 }, (_, j) =>
      generateCardInstance(body, { instanceId: "deck-" + i + "-" + j }),
    );
    p.board = [0, 1, 2, 3].map((j) => ({
      ...generateCardInstance(body, { instanceId: "unit-" + i + "-" + j }),
      boardSlot: j,
      enteredThisTurn: false,
      currentAttack: 0,
    }));
  }
  return s;
}
function act(s, a) {
  const r = executeAction(JSON.parse(JSON.stringify(s)), a);
  assert.ok(r.success, r.message);
  return r.state;
}
function grant(s, id = "unit-0-1") {
  return act(s, {
    type: "COMMIT_TARGETED_ACTION",
    playerId: s.players[0].id,
    action: { type: "USE_CHAMPION_ABILITY" },
    targetId: id,
  });
}
test("current published definition and legacy ability both choose exactly one allied wrestler; no stat/cost reset", () => {
  const s = fixture();
  assert.equal(s.players[0].champion.quest.requiredProgress, 8);
  let ability = currentChampionAbility(s.players[0].champion);
  let e = ability.effects.find(
    (e) => e.values?.balance?.operation === "GRANT_DODGE_ONCE",
  );
  assert.equal(e.target.selection, "PLAYER_CHOICE");
  assert.equal(e.target.count, 1);
  s.players[0].champion.ability.effects =
    s.players[0].champion.ability.effects.map((e) =>
      e.values?.balance?.operation === "GRANT_DODGE_ONCE"
        ? { ...e, target: undefined }
        : e,
    );
  ability = currentChampionAbility(s.players[0].champion);
  assert.equal(
    ability.effects.find(
      (e) => e.values?.balance?.operation === "GRANT_DODGE_ONCE",
    ).target.count,
    1,
  );
});
test("one of four allies gains dodge and the other seven field cards stay unchanged; exact basic cost and self damage", () => {
  const s = fixture(),
    n = grant(s);
  assert.deepEqual(
    n.players[0].board.map((c) => c.dodgeCharges),
    [0, 1, 0, 0],
  );
  assert.ok(n.players[1].board.every((c) => !c.dodgeCharges));
  assert.equal(n.players[0].health, 18);
  assert.equal(n.players[0].currentGold, 0);
  assert.equal(n.players[0].championAbilityUsedThisTurn, true);
  assert.equal(n.players[0].champion.questCompleted, false);
});
test("preview and cancellation spend nothing; invalid opponent/champion target commits nothing", () => {
  const s = fixture(),
    p = s.players[0].id;
  const preview = act(s, {
    type: "BEGIN_TARGETED_ACTION",
    playerId: p,
    action: { type: "USE_CHAMPION_ABILITY" },
  });
  assert.equal(preview.targetingState.phase, "PRE_COMMIT");
  assert.equal(preview.targetingState.validTargetIds.length, 4);
  assert.equal(preview.players[0].health, 20);
  assert.equal(preview.players[0].currentGold, 1);
  const cancel = act(preview, { type: "CANCEL_EFFECT_TARGET", playerId: p });
  assert.equal(cancel.players[0].health, 20);
  assert.equal(cancel.players[0].championAbilityUsedThisTurn, false);
  for (const id of ["unit-1-0", s.players[1].id]) {
    const r = executeAction(s, {
      type: "COMMIT_TARGETED_ACTION",
      playerId: p,
      action: { type: "USE_CHAMPION_ABILITY" },
      targetId: id,
    });
    assert.equal(r.success, false);
    assert.equal(s.players[0].health, 20);
    assert.equal(s.players[0].currentGold, 1);
  }
});
test("upgrade spends only the available extra one gold and heals three, maintaining one target", () => {
  const s = fixture();
  s.players[0].currentGold = 2;
  const n = grant(s);
  assert.equal(n.players[0].currentGold, 0);
  assert.equal(n.players[0].health, 21);
  assert.deepEqual(
    n.players[0].board.map((c) => c.dodgeCharges),
    [0, 1, 0, 0],
  );
  assert.equal(
    n.events.filter((e) => e.type === "PROGRAM_ACTIVATED").length,
    1,
  );
});
test("each instance receives the champion grant once; fresh ally eligible and native Dodge can gain a charge", () => {
  let s = grant(fixture());
  s.players[0].currentGold = 1;
  s.players[0].championAbilityUsedThisTurn = false;
  let r = executeAction(s, {
    type: "BEGIN_TARGETED_ACTION",
    playerId: s.players[0].id,
    action: { type: "USE_CHAMPION_ABILITY" },
  });
  assert.ok(r.success);
  assert.ok(!r.state.targetingState.validTargetIds.includes("unit-0-1"));
  s.players[0].board = s.players[0].board.map((c) => ({
    ...c,
    championDodgeGranted: true,
  }));
  r = executeAction(s, {
    type: "USE_CHAMPION_ABILITY",
    playerId: s.players[0].id,
  });
  assert.equal(r.success, false);
  assert.equal(s.players[0].health, 18);
  s.players[0].board[2] = {
    ...generateCardInstance(
      { ...body, keywords: ["DODGE"] },
      { instanceId: "fresh" },
    ),
    boardSlot: 2,
  };
  s = grant(s, "fresh");
  assert.equal(s.players[0].board[2].dodgeCharges, 2);
  assert.ok(s.players[0].board[2].championDodgeGranted);
});
test("real defending combat dodges advance eight times, not on grant/zero damage; finisher given exactly once after JSON turns", () => {
  let s = fixture();
  s.activePlayerId = s.players[1].id;
  s.players[1].board[0].currentAttack = 1;
  for (const c of s.players[0].board)
    Object.assign(c, {
      keywords: ["DODGE"],
      dodgeAvailable: true,
      dodgeCharges: 2,
    });
  for (let i = 0; i < 8; i++) {
    const target = s.players[0].board[Math.floor(i / 2)];
    s = act(s, {
      type: "ATTACK",
      playerId: s.players[1].id,
      attackerInstanceId: "unit-1-0",
      target: {
        type: "WRESTLER",
        playerId: s.players[0].id,
        cardInstanceId: target.instanceId,
      },
    });
    assert.equal(s.players[0].champion.questCompleted, i === 7);
    assert.equal(s.players[0].champion.questConditionCounts.root, i + 1);
    if (i < 7) {
      s = act(s, { type: "END_TURN", playerId: s.players[1].id });
      s = act(s, { type: "END_TURN", playerId: s.players[0].id });
    }
  }
  // Seven real turns filled the hand: completing preparation must wait for a discard.
  assert.ok(s.targetingState?.handAddition);
  const discardId = s.players[0].hand[0].instanceId;
  s = act(s, {
    type: "SELECT_EFFECT_TARGET",
    playerId: s.players[0].id,
    targetId: discardId,
  });
  assert.ok(s.players[0].graveyard.some((c) => c.instanceId === discardId));

  assert.equal(
    s.players[0].hand.filter((c) => c.definitionId === finisher.id).length,
    1,
  );
  const n = processChampionQuestEvents(s, s);
  assert.equal(
    n.players[0].hand.filter((c) => c.definitionId === finisher.id).length,
    1,
  );
});
test("ally dodging a counterattack counts; enemy dodge, zero damage do not", () => {
  let s = fixture();
  Object.assign(s.players[0].board[0], {
    keywords: ["DODGE"],
    dodgeAvailable: true,
    dodgeCharges: 1,
  });
  s.players[1].board[0].currentAttack = 1;
  s = act(s, {
    type: "ATTACK",
    playerId: s.players[0].id,
    attackerInstanceId: "unit-0-0",
    target: {
      type: "WRESTLER",
      playerId: s.players[1].id,
      cardInstanceId: "unit-1-0",
    },
  });
  assert.equal(s.players[0].champion.questConditionCounts.root, 1);
  let z = fixture();
  z.activePlayerId = z.players[1].id;
  Object.assign(z.players[0].board[0], {
    keywords: ["DODGE"],
    dodgeAvailable: true,
    dodgeCharges: 1,
  });
  z = act(z, {
    type: "ATTACK",
    playerId: z.players[1].id,
    attackerInstanceId: "unit-1-0",
    target: {
      type: "WRESTLER",
      playerId: z.players[0].id,
      cardInstanceId: "unit-0-0",
    },
  });
  assert.equal(z.players[0].champion.questConditionCounts?.root ?? 0, 0);
  assert.equal(z.players[0].board[0].dodgeCharges, 1);
  let e = fixture();
  Object.assign(e.players[1].board[0], {
    keywords: ["DODGE"],
    dodgeAvailable: true,
    dodgeCharges: 1,
  });
  e.players[0].board[0].currentAttack = 1;
  e = act(e, {
    type: "ATTACK",
    playerId: e.players[0].id,
    attackerInstanceId: "unit-0-0",
    target: {
      type: "WRESTLER",
      playerId: e.players[1].id,
      cardInstanceId: "unit-1-0",
    },
  });
  assert.equal(e.players[0].champion.questConditionCounts?.root ?? 0, 0);
});
test("real effect-damage dodge counts by explicit dodge tag even for an enemy effect source", () => {
  let s = fixture();
  Object.assign(s.players[0].board[0], {
    keywords: ["DODGE"],
    dodgeAvailable: true,
    dodgeCharges: 1,
  });
  const effect = {
    type: "STRUCTURED",
    action: "DAMAGE",
    target: {
      zone: "BOARD",
      owner: "ENEMY",
      selection: "SAME_TARGET",
      count: 1,
    },
    values: { amount: 3 },
  };
  const after = applyEffect(s, s.players[1].id, s.players[1].board[0], effect, [
    "unit-0-0",
  ]);
  s = processChampionQuestEvents(s, after);
  assert.equal(s.players[0].champion.questConditionCounts.root, 1);
  assert.equal(s.players[0].board[0].currentHealth, 30);
  assert.equal(s.players[0].board[0].dodgeCharges, 0);
});

test("prevented damage does not consume dodge or advance preparation", () => {
  let s = fixture();
  s.activePlayerId = s.players[1].id;
  s.players[1].board[0].currentAttack = 5;
  s.preventedDamageTargetIds = ["unit-0-0"];
  Object.assign(s.players[0].board[0], {
    keywords: ["DODGE"],
    dodgeAvailable: true,
    dodgeCharges: 1,
  });
  s = act(s, {
    type: "ATTACK",
    playerId: s.players[1].id,
    attackerInstanceId: "unit-1-0",
    target: {
      type: "WRESTLER",
      playerId: s.players[0].id,
      cardInstanceId: "unit-0-0",
    },
  });
  assert.equal(s.players[0].champion.questConditionCounts?.root ?? 0, 0);
  assert.equal(s.players[0].board[0].dodgeCharges, 1);
  assert.equal(s.players[0].board[0].currentHealth, 30);
});

test("AI selects one eligible ally and unavailable grants are not legal actions", () => {
  let s = fixture(),
    p = s.players[0].id;
  s = act(s, { type: "USE_CHAMPION_ABILITY", playerId: p });
  assert.ok(s.targetingState);
  const action = chooseBestAction(s, getLegalActions(s, p), p);
  assert.equal(action.type, "SELECT_EFFECT_TARGET");
  s = act(s, action);
  assert.equal(
    s.players[0].board.filter((c) => c.championDodgeGranted).length,
    1,
  );
  s.players[0].currentGold = 1;
  s.players[0].championAbilityUsedThisTurn = false;
  for (const c of s.players[0].board) c.championDodgeGranted = true;
  assert.ok(
    !getLegalActions(s, p).some((a) => a.type === "USE_CHAMPION_ABILITY"),
  );
});

test("legacy saved multi-target prompt is repaired without restoring spent gold or changing used flags", async () => {
  const { normalizeNatomatoTargeting } =
    await import("../../artifacts/ko-game/src/game/champions/natomato-targeting.ts");
  let s = fixture();
  s = act(s, {
    type: "BEGIN_TARGETED_ACTION",
    playerId: s.players[0].id,
    action: { type: "USE_CHAMPION_ABILITY" },
  });
  s.players[0].board[1].championDodgeGranted = true;
  Object.assign(s.targetingState, {
    minTargets: 0,
    maxTargets: 4,
    selectedTargetIds: ["unit-0-0", "unit-0-1"],
  });
  s = normalizeNatomatoTargeting(JSON.parse(JSON.stringify(s)));
  assert.equal(s.targetingState.minTargets, 1);
  assert.equal(s.targetingState.maxTargets, 1);
  assert.deepEqual(s.targetingState.selectedTargetIds, []);
  assert.ok(!s.targetingState.validTargetIds.includes("unit-0-1"));
  assert.equal(s.players[0].health, 20);
  assert.equal(s.players[0].currentGold, 1);
  assert.equal(s.players[0].championAbilityUsedThisTurn, false);
});
