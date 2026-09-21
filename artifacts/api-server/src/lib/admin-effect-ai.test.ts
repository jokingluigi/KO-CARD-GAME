import assert from "node:assert/strict";
import test from "node:test";

import { EffectAiError, validateGeneratedEffectDraft } from "./admin-effect-ai";

const catalog = [
  { id: "card-1", name: "불꽃", cardType: "WRESTLER" as const, isToken: false, isChampionToken: false },
  { id: "card-2", name: "불꽃", cardType: "WRESTLER" as const, isToken: false, isChampionToken: false },
  { id: "token-1", name: "작은 토큰", cardType: "WRESTLER" as const, isToken: true, isChampionToken: false },
];

test("AI 고정 카드 참조는 catalog ID로 canonicalize한다", () => {
  const result = validateGeneratedEffectDraft({
    status: "READY",
    effects: [{
      trigger: "ENTER_FIELD",
      action: "SUMMON",
      values: { definitionRef: { name: "작은 토큰" } },
    }],
    keywords: [],
  }, { sourceType: "CARD", cardType: "WRESTLER" }, catalog);

  assert.equal(result.status, "READY");
  if (result.status === "READY") {
    assert.deepEqual(result.effects[0]?.values?.definitionRef, { id: "token-1" });
  }
});

test("AI가 모호한 카드 이름을 고르면 추측하지 않고 거부한다", () => {
  assert.throws(
    () => validateGeneratedEffectDraft({
      status: "READY",
      effects: [{
        trigger: "ENTER_FIELD",
        action: "SUMMON",
        values: { definitionRef: { name: "불꽃" } },
      }],
      keywords: [],
    }, { sourceType: "CARD", cardType: "WRESTLER" }, catalog),
    (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT" &&
      error.message.includes("모호합니다"),
  );
});

test("Registry에 없는 필드는 AI 초안에 남길 수 없다", () => {
  assert.throws(
    () => validateGeneratedEffectDraft({
      status: "READY",
      effects: [{
        trigger: "ENTER_FIELD",
        action: "DAMAGE",
        target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
        values: { amount: 2 },
        executeSql: "drop table cards",
      }],
      keywords: [],
    }, { sourceType: "CARD", cardType: "WRESTLER" }, catalog),
    (error: unknown) => error instanceof EffectAiError && error.code === "INVALID_DRAFT",
  );
});

test("AI는 모호한 효과를 clarification 상태로 반환할 수 있다", () => {
  const result = validateGeneratedEffectDraft({
    status: "NEEDS_CLARIFICATION",
    questions: ["피해량은 얼마인가요?"],
  }, { sourceType: "CARD", cardType: "WRESTLER" }, catalog);

  assert.deepEqual(result, {
    status: "NEEDS_CLARIFICATION",
    questions: ["피해량은 얼마인가요?"],
  });
});