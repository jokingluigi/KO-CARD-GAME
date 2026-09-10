import assert from "node:assert/strict";
import test from "node:test";
import { createReplitAgentPrompt, prepareReplitAgentPrompt } from "./replit-agent-prompt";
import { analyzeEffectText, effectLibrary } from "./structured-effects";

test("Replit prompt is complete, safe, generic and deterministic", () => {
  const analysis = analyzeEffectText("등장: 모든 카드를 무작위로 섞습니다.");
  const first = createReplitAgentPrompt("등장: 모든 카드를 무작위로 섞습니다.", analysis);
  assert.equal(first, createReplitAgentPrompt("등장: 모든 카드를 무작위로 섞습니다.", analysis));
  for (const text of ["카드 이름", "원본 카드 효과", "현재 Analyzer가 이해한 내용", "현재 지원되는 부분", "지원되지 않는", "Trigger", "Action", "Target", "Value Resolver", "Condition", "Listener", "Duration", "Sequence", "관련 KO 게임 규칙", "Effect Registry", "Effect Schema", "Effect Handler", "Analyzer mapping", "테스트 요구사항", "eval()", "new Function()", "카드 이름 또는 id 기반 분기"]) assert.ok(first.includes(text));
});

test("Replit prompt derives reusable entries from the passed live library", () => {
  const analysis = analyzeEffectText("등장: 모든 카드를 무작위로 섞습니다.");
  const live = effectLibrary();
  const prompt = createReplitAgentPrompt("등장: 모든 카드를 무작위로 섞습니다.", analysis, live);
  assert.ok(prompt.includes(live.targetResolvers[0].name));
  assert.ok(prompt.includes("ACTIVE Condition Registry"));
});

test("prompt decision uses the freshly supplied library metadata", () => {
  const analysis = analyzeEffectText("등장: 내 손패의 모든 선수 카드의 공격력을 서로 무작위로 섞습니다.");
  const live = effectLibrary();
  const refreshed = {
    ...live,
    actions: live.actions.map((entry) => entry.name === "BUFF"
      ? { ...entry, description: "새로 배포된 스탯 쓰기 설명" }
      : entry),
  } as unknown as typeof live;
  const result = prepareReplitAgentPrompt("등장: 내 손패의 모든 선수 카드의 공격력을 서로 무작위로 섞습니다.", analysis, refreshed);
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") assert.ok(result.prompt.includes("새로 배포된 스탯 쓰기 설명"));
});

test("shuffle inference uses only meaningful live building blocks", () => {
  const text = "등장: 내 손패의 모든 선수 카드의 공격력을 서로 무작위로 섞습니다.";
  const prompt = createReplitAgentPrompt(text, analyzeEffectText(text));
  assert.ok(prompt.includes("SHUFFLE_STAT_VALUES_ACROSS_TARGET_SET"));
  assert.ok(prompt.includes("ZONE_OWNER_SELECTION"));
  assert.ok(prompt.includes("BUFF"));
  assert.ok(prompt.includes("현재 Action에는 대상 집합 사이의 값을 순열"));
  assert.ok(!prompt.includes("DAMAGE ("));
});

test("time stop and rewind do not receive unrelated action fallbacks", () => {
  for (const [text, candidate] of [
    ["등장: 시간을 멈춥니다.", "TEMPORARY_ACTION_WINDOW_SUPPRESSION"],
    ["등장: 상대 선수를 3턴 전 상태로 되돌립니다.", "RESTORE_SERIALIZED_GAMESTATE_SNAPSHOT"],
  ]) {
    const prompt = createReplitAgentPrompt(text, analyzeEffectText(text));
    assert.ok(prompt.includes(candidate));
    assert.ok(prompt.includes("Effect / Action: 관련 ACTIVE 항목 없음"));
    assert.ok(!prompt.includes("DAMAGE ("));
    assert.ok(!prompt.includes("BUFF ("));
  }
});

test("prompt decision keeps supported effects separate from unsupported outcomes", () => {
  assert.equal(prepareReplitAgentPrompt("등장: 카드 1장 드로우", analyzeEffectText("등장: 카드 1장 드로우")).kind, "supported");
  const result = prepareReplitAgentPrompt("대단한 일을 합니다.", analyzeEffectText("대단한 일을 합니다."), effectLibrary(), "불명확한 카드");
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.ok(result.prompt.includes("카드 이름: 불명확한 카드"));
    assert.ok(result.prompt.includes("현재 지원되는 부분"));
    assert.ok(result.prompt.includes("지원되지 않는 부분"));
    assert.ok(result.prompt.includes("이 카드 효과가 실제 게임에서 동작하도록 구현하세요."));
  }
});