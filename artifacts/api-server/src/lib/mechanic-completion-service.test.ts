import assert from "node:assert/strict";
import test from "node:test";

import { effectLibrary } from "./structured-effects";
import {
  countStructuredEffectUsage,
  prepareCompletionApply,
  validateMechanicCompletion,
} from "./mechanic-completion-service";

const supportedText = "등장: 자신에게 +2/+2를 부여합니다.";

test("완료 검증은 recognized, partial, not_found를 구분한다", () => {
  const recognized = validateMechanicCompletion(supportedText);
  assert.equal(recognized.status, "recognized");
  assert.deepEqual(recognized.checks.map((check) => check.id), [
    "registry", "schema", "handler", "resolver", "analyzer", "structured", "tests",
  ]);
  assert.equal(recognized.checks.find((check) => check.id === "tests")?.passed, false);
  assert.ok(recognized.checks.slice(0, 6).every((check) => check.passed));

  const partial = validateMechanicCompletion(
    `${supportedText} 그리고 덱을 무작위로 섞습니다.`,
  );
  assert.equal(partial.status, "partial");
  assert.ok(partial.unsupportedParts.length > 0);

  const notFound = validateMechanicCompletion("시간을 완전히 멈춥니다.");
  assert.equal(notFound.status, "not_found");
  assert.equal(notFound.structuredEffect, undefined);
});

test("완료 검증은 호출마다 최신 Library를 읽고 DISABLED effect를 제외한다", () => {
  let calls = 0;
  const library = effectLibrary();
  const disabledLibrary = () => {
    calls += 1;
    return {
      ...library,
      actions: library.actions.map((action) =>
        action.name === "BUFF" ? { ...action, status: "DISABLED" as const } : action,
      ),
    };
  };

  const first = validateMechanicCompletion(supportedText, { library: disabledLibrary });
  const second = validateMechanicCompletion(supportedText, { library: disabledLibrary });
  assert.equal(calls, 2);
  assert.equal(first.status, "not_found");
  assert.equal(second.status, "not_found");
  assert.equal(first.checks.find((check) => check.id === "registry")?.passed, false);
});

test("완료 검증은 structured validation 실패를 recognized로 승인하지 않는다", () => {
  const result = validateMechanicCompletion(supportedText, {
    validateStructured: () => false,
  });
  assert.equal(result.status, "not_found");
  assert.equal(result.checks.find((check) => check.id === "structured")?.passed, false);
});

test("DRAFT 적용 결정은 저장 직전 조건을 모두 지킨다", () => {
  const validation = validateMechanicCompletion(supportedText);
  assert.equal(prepareCompletionApply(
    { status: "PUBLISHED", text: supportedText },
    supportedText,
    validation,
  ).ok, false);
  assert.deepEqual(prepareCompletionApply(
    { status: "DRAFT", text: "변경된 문장" },
    supportedText,
    validation,
  ), { ok: false, reason: "SOURCE_TEXT_CHANGED" });
  assert.deepEqual(prepareCompletionApply(
    { status: "DRAFT", text: supportedText },
    supportedText,
    { ...validation, status: "partial" },
  ), { ok: false, reason: "REVALIDATION_FAILED" });
  assert.deepEqual(prepareCompletionApply(
    { status: "DRAFT", text: supportedText },
    supportedText,
    validation,
    () => false,
  ), { ok: false, reason: "REVALIDATION_FAILED" });

  const decision = prepareCompletionApply(
    { status: "DRAFT", text: supportedText },
    supportedText,
    validation,
  );
  assert.equal(decision.ok, true);
  if (!decision.ok) return;
  assert.equal(decision.values.text, supportedText);
  assert.equal(decision.values.effectId, "STRUCTURED_EFFECTS_V1");
  assert.equal(decision.values.status, "APPROVED");
  assert.deepEqual(decision.values.resolvedEffectIds, ["BUFF"]);
});

test("Library usage count는 하드코딩 목록 없이 카드별 action 사용을 센다", () => {
  const validation = validateMechanicCompletion(
    "등장: 적 선수 하나를 침묵시키고 파괴합니다.",
  );
  assert.equal(validation.status, "recognized");
  const usage = countStructuredEffectUsage([
    { effectId: "STRUCTURED_EFFECTS_V1", effectConfig: validation.structuredEffect },
    { effectId: "STRUCTURED_EFFECTS_V1", effectConfig: validation.structuredEffect },
    { effectId: null, effectConfig: validation.structuredEffect },
    { effectId: "STRUCTURED_EFFECTS_V1", effectConfig: { effects: [] } },
  ]);
  assert.equal(usage.get("SILENCE"), 2);
  assert.equal(usage.get("DESTROY"), 2);
  assert.equal(usage.has("BUFF"), false);
});