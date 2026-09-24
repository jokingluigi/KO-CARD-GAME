import assert from "node:assert/strict";
import test from "node:test";
import { isEffectScript } from "@workspace/effect-registry";

function script(action: string, values?: Record<string, unknown>, target?: Record<string, unknown>) {
  return {
    version: "SCRIPT_V1",
    trigger: "ENTER_FIELD",
    steps: [{
      type: "EFFECT",
      effect: {
        action,
        ...(target ? { target } : {}),
        ...(values ? { values } : {}),
      },
    }],
  };
}

const enemyBoardTarget = { zone: "BOARD", owner: "ENEMY", selection: "ALL" };

test("SCRIPT_V1 rejects primitive values with invalid types, ranges, enums, or action mismatches", () => {
  const invalidScripts = [
    script("DAMAGE", { amount: "2" }, enemyBoardTarget),
    script("DAMAGE", { amount: -2 }, enemyBoardTarget),
    script("DAMAGE", { amount: 2, stat: "HEALTH" }, enemyBoardTarget),
    script("MODIFY_STAT", { amount: 1, stat: "BOGUS", duration: "PERMANENT" }, enemyBoardTarget),
    script("MODIFY_STAT", { amount: 1, stat: "HEALTH", duration: "FOREVER" }, enemyBoardTarget),
    script("ADD_DAMAGE_MODIFIER", { amount: 1, damageSource: "ANY" }),
    script("REDUCE_COST", { amount: 1, minimum: -1 }, enemyBoardTarget),
    script("GENERATE", { destination: "NOWHERE" }),
  ];

  for (const invalid of invalidScripts) {
    assert.equal(isEffectScript(invalid), false, JSON.stringify(invalid));
  }
});

test("SCRIPT_V1 continues to accept bounded values that match their action schema", () => {
  assert.equal(isEffectScript(script("DAMAGE", { amount: 2 }, enemyBoardTarget)), true);
  assert.equal(isEffectScript(script("MODIFY_STAT", {
    amount: -1,
    stat: "COST",
    duration: "THIS_TURN",
    minimum: 0,
  }, enemyBoardTarget)), true);
  assert.equal(isEffectScript(script("ADD_DAMAGE_MODIFIER", {
    amount: 1,
    damageSource: "GENERATED",
  })), true);
});