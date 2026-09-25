import assert from "node:assert/strict";
import test from "node:test";
import { validateGeneratedEffectDraft } from "./admin-effect-ai";
import { dryRunCardEffect } from "./effect-dry-run";

const context = { sourceType: "CARD" as const, cardType: "WRESTLER" as const };

function draft(effects: unknown) {
  const result = validateGeneratedEffectDraft({ status: "READY", effectId: "STRUCTURED_EFFECTS_V1", effects }, context, []);
  assert.equal(result.status, "READY");
  return result;
}

test("효과 제작기는 게임 시작 효과를 덱에서 실제 게임 시작으로 시험한다", () => {
  const result = dryRunCardEffect(draft([{ trigger: "GAME_START", action: "MODIFY_STAT",
    target: { zones: ["DECK", "HAND"], owner: "SELF", selection: "SELF", count: 1 },
    values: { stat: "ATTACK", amount: 2 },
  }]));
  assert.equal(result[0]?.status, "EXECUTED");
});

test("효과 제작기는 턴 시작과 턴 종료의 경기 이벤트를 시험한다", () => {
  const result = dryRunCardEffect(draft([
    { trigger: "TURN_START", action: "DAMAGE", target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 }, values: { amount: 2 } },
    { trigger: "TURN_END", action: "DAMAGE", target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 }, values: { amount: 3 } },
  ]));
  assert.deepEqual(result.map((run) => [run.trigger, run.status, run.enemyHealthDelta]), [
    ["TURN_START", "EXECUTED", 2], ["TURN_END", "EXECUTED", 3],
  ]);
});

test("효과 제작기는 저장 전 등장 3연타 스크립트를 경기에서 시험한다", () => {
  const result = validateGeneratedEffectDraft({ status: "READY", effectId: "SCRIPT_V1", scripts: [{
    version: "SCRIPT_V1", trigger: "ENTER_FIELD", steps: [{ type: "REPEAT", count: { kind: "CONSTANT", value: 3 }, steps: [
      { type: "EFFECT", effect: { action: "DAMAGE", target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 }, values: { amount: 1 } } },
    ] }],
  }] }, context, []);
  assert.equal(result.status, "READY");
  assert.deepEqual(dryRunCardEffect(result).map((run) => [run.status, run.enemyHealthDelta]), [["EXECUTED", 3]]);
});

test("시험 카드 목록으로 재귀 소환을 실행할 위험이 있는 효과는 별도 경기 시험으로 안내한다", () => {
  const result = dryRunCardEffect(draft([{ trigger: "ENTER_FIELD", action: "SUMMON",
    target: { zone: "BOARD", owner: "SELF", selection: "RANDOM", count: 1 },
  }]));
  assert.equal(result[0]?.status, "NOT_SIMULATED");
});
