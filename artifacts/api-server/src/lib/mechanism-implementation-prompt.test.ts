import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEffectText, effectLibrary } from "./structured-effects";
import { createMechanismImplementationPrompt } from "./mechanism-implementation-prompt";

test("implementation prompt preserves the request and names actual registry capabilities", () => {
  const request = "등장: 시간을 멈추고 다음 턴을 건너뜁니다.";
  const analysis = analyzeEffectText(request);
  const prompt = createMechanismImplementationPrompt(
    request,
    { sourceType: "CARD", sourceName: "시험 카드" },
    analysis,
    effectLibrary(),
  );
  assert.match(prompt, /시험 카드/);
  assert.ok(prompt.includes(request));
  assert.match(prompt, /현재 등록된 ACTIVE 기능/);
  assert.match(prompt, /Effect Registry/);
  assert.match(prompt, /카드 이름이나 ID에 따른 특수 분기/);
  assert.match(prompt, /자동 변경되지는 않습니다/);
  assert.ok(prompt.includes(analysis.outcome));
});

test("unclear champion wording is kept as an unresolved requirement", () => {
  const prompt = createMechanismImplementationPrompt(
    "턴마다 멋있게 해줘",
    { sourceType: "CHAMPION", effectContext: "CHAMPION_ABILITY" },
    analyzeEffectText("턴마다 멋있게 해줘"),
    effectLibrary(),
  );
  assert.match(prompt, /챔피언 · CHAMPION_ABILITY/);
  assert.match(prompt, /관리자에게 확인할 질문/);
  assert.match(prompt, /없다고 단정하지 마세요/);
});
