import assert from "node:assert/strict";
import test from "node:test";

import { analyzeEffectText, effectLibrary, isStructuredEffects } from "./structured-effects";

test("필수 카드 문장을 안전한 구조화 효과로 분석한다", () => {
  const cases = [
    {
      text: "등장: 자신에게 +2/+2를 부여합니다.",
      actions: ["BUFF"],
      target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
      values: { attack: 2, health: 2 },
    },
    {
      text: "등장: 손패의 선수 카드 한 장에게 +1/+1을 부여합니다.",
      actions: ["BUFF"],
      target: { zone: "HAND", owner: "SELF", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 },
      values: { attack: 1, health: 1 },
    },
    {
      text: "등장: 적 선수 하나에게 피해 2를 줍니다.",
      actions: ["DAMAGE"],
      target: { zone: "BOARD", owner: "ENEMY", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 },
      values: { amount: 2 },
    },
    {
      text: "등장: 손패의 무작위 선수 카드 3장에게 +1/+1을 부여합니다.",
      actions: ["BUFF"],
      target: { zone: "HAND", owner: "SELF", cardType: "WRESTLER", selection: "RANDOM", count: 3 },
      values: { attack: 1, health: 1 },
    },
    {
      text: "등장: 적 선수 하나를 침묵시키고 파괴합니다.",
      actions: ["SILENCE", "DESTROY"],
      target: { zone: "BOARD", owner: "ENEMY", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 },
      values: undefined,
    },
    {
      text: "등장: 상대 챔피언에게 5 데미지를 줍니다.",
      actions: ["DAMAGE"],
      target: { zone: "PLAYER", owner: "ENEMY", selection: "SELF", count: 1 },
      values: { amount: 5 },
    },
    {
      text: "등장: 적 캐릭터 하나에게 피해 2를 줍니다.",
      actions: ["DAMAGE"],
      target: { zone: "CHARACTER", owner: "ENEMY", selection: "PLAYER_CHOICE", count: 1 },
      values: { amount: 2 },
    },
    {
      text: "등장: 선택한 적 캐릭터에게 데미지 1을 줍니다.",
      actions: ["DAMAGE"],
      target: { zone: "CHARACTER", owner: "ENEMY", selection: "PLAYER_CHOICE", count: 1 },
      values: { amount: 1 },
    },
    {
      text: "등장: 아군 캐릭터 하나를 2 회복합니다.",
      actions: ["HEAL"],
      target: { zone: "CHARACTER", owner: "SELF", selection: "PLAYER_CHOICE", count: 1 },
      values: { amount: 2 },
    },
    {
      text: "등장: 모든 캐릭터에게 피해 2를 줍니다.",
      actions: ["DAMAGE"],
      target: { zone: "CHARACTER", owner: "ALL", selection: "ALL", count: 20 },
      values: { amount: 2 },
    },
    {
      text: "등장: 모든 캐릭터를 2 회복합니다.",
      actions: ["HEAL"],
      target: { zone: "CHARACTER", owner: "ALL", selection: "ALL", count: 20 },
      values: { amount: 2 },
    },
  ] as const;

  for (const example of cases) {
    const analysis = analyzeEffectText(example.text);
    assert.equal(analysis.status, "success", example.text);
    assert.deepEqual(
      analysis.effects.map((effect) => effect.action),
      example.actions,
      example.text,
    );
    assert.deepEqual(analysis.effects[0]?.target, example.target, example.text);
    assert.deepEqual(analysis.effects[0]?.values, example.values, example.text);
    assert.equal(
      isStructuredEffects({ effects: analysis.effects }),
      true,
      example.text,
    );
  }
});

test("요구된 기존 라이브러리 문장을 모두 지원한다", () => {
  for (const text of [
    "등장: 골드 1 획득", "등장: 카드 1장 드로우", "등장: 자신에게 +1/+1",
    "등장: 적 선수 하나에게 피해 2", "등장: 적 선수 하나를 침묵시키고 파괴", "도발", "회피",
  ]) {
    const result = analyzeEffectText(text);
    assert.equal(result.outcome, "supported", text);
    assert.equal(result.status, "success", text);
  }
});

test("현재 registry에서 제공하는 Effect Library 메타데이터를 노출한다", () => {
  const library = effectLibrary();
  assert.ok(library.actions.length >= 19);
  assert.deepEqual(library.actions.find((action) => action.name === "DAMAGE")?.requiredConfig, { target: true, values: { amount: "number (0..999)" } });
  assert.ok(library.triggers.every((trigger) => trigger.status === "ACTIVE"));
  assert.ok(library.targetResolvers.length > 0);
  assert.ok(library.valueResolvers.length > 0);
});

test("인식 가능한 신규 메커니즘은 부분 적용 없이 필요 상태로 분류한다", () => {
  const result = analyzeEffectText("등장: 내 손패의 모든 선수 카드의 공격력을 서로 무작위로 섞습니다.");
  assert.equal(result.outcome, "mechanism_required");
  assert.equal(result.status, "partial");
  assert.equal(result.effects.length, 0);
  assert.ok(result.unsupportedSegments.some((segment) => segment.includes("섞")));
});

test("지원 효과와 알려진 신규 메커니즘이 섞여도 미리보기만 제공한다", () => {
  const result = analyzeEffectText("등장: 적 선수 하나에게 피해 2를 주고 시간을 멈춥니다.");
  assert.equal(result.outcome, "mechanism_required");
  assert.equal(result.status, "partial");
  assert.deepEqual(result.effects.map((effect) => effect.action), ["DAMAGE"]);
  assert.ok(result.unsupportedSegments.some((segment) => segment.includes("시간")));
});

test("인식 가능한 미지원 메커니즘은 적용 가능한 효과로 만들지 않는다", () => {
  const failure = analyzeEffectText(
    "등장: 상대 선수를 3턴 전 상태로 되돌립니다.",
  );
  assert.equal(failure.outcome, "mechanism_required");
  assert.equal(failure.effects.length, 0);
  assert.ok(failure.unsupportedSegments.length > 0);
});

test("지원 액션과 미지원 문장이 섞이면 부분 분석으로 표시한다", () => {
  const partial = analyzeEffectText(
    "등장: 적 선수 하나에게 피해 2를 주고 시간을 멈춥니다.",
  );
  assert.equal(partial.status, "partial");
  assert.deepEqual(partial.effects.map((effect) => effect.action), ["DAMAGE"]);
  assert.ok(partial.unsupportedSegments.length > 0);
});

test("알 수 없는 추가 문장을 성공으로 숨기지 않는다", () => {
  const partial = analyzeEffectText(
    "등장: 적 선수 하나에게 피해 2를 주고 노래를 부릅니다.",
  );
  assert.equal(partial.status, "partial");
  assert.ok(partial.unsupportedSegments.some((segment) => segment.includes("노래")));
});

test("아직 실행할 수 없는 액티브 직접 선택은 적용을 차단한다", () => {
  const partial = analyzeEffectText(
    "액티브: 적 선수 하나에게 피해 2를 줍니다.",
  );
  assert.equal(partial.status, "partial");
  assert.equal(
    isStructuredEffects({ effects: partial.effects }),
    false,
  );
});

test("잘못 조합된 구조화 JSON을 거부한다", () => {
  assert.equal(
    isStructuredEffects({
      effects: [{
        trigger: "ENTER_FIELD",
        action: "DESTROY",
        target: {
          zone: "PLAYER",
          owner: "ENEMY",
          selection: "SELF",
          count: 1,
        },
      }],
    }),
    false,
  );
  assert.equal(
    isStructuredEffects({
      effects: [{
        trigger: "ENTER_FIELD",
        action: "SILENCE",
        target: {
          zone: "CHARACTER",
          owner: "ENEMY",
          selection: "PLAYER_CHOICE",
          count: 1,
        },
      }],
    }),
    true,
  );
  assert.equal(
    isStructuredEffects({
      effects: [{
        trigger: "ENTER_FIELD",
        action: "REDUCE_COST",
        target: { zone: "CHARACTER", owner: "ALL", selection: "ALL", count: 20 },
        values: { amount: 1 },
      }],
    }),
    false,
  );
  assert.equal(
    isStructuredEffects({
      effects: [{
        trigger: "ENTER_FIELD",
        action: "DAMAGE",
        target: { zone: "BOARD", owner: "ALL", selection: "ALL", count: 20 },
        values: { amount: 1 },
      }],
    }),
    false,
  );
});

test("별칭, 드로우와 기본 키워드를 Registry로 분석한다", () => {
  const actionCases = [
    ["등장 : 골드 1 얻음", "ADD_GOLD"],
    ["등장: 1G 획득", "ADD_GOLD"],
    ["등장: 현재 골드 +1", "ADD_GOLD"],
    ["등장: 적 선수 하나에게 2 데미지", "DAMAGE"],
    ["등장: 카드 2장 뽑습니다.", "DRAW"],
    ["등장: 자신에게 러쉬를 부여합니다.", "ADD_KEYWORD"],
  ] as const;
  for (const [text, action] of actionCases) {
    const result = analyzeEffectText(text);
    assert.equal(result.status, "success", text);
    assert.equal(result.effects[0]?.action, action, text);
    assert.equal(isStructuredEffects({ effects: result.effects }), true, text);
  }
  assert.deepEqual(analyzeEffectText("도발").keywords, ["TAUNT"]);
  assert.deepEqual(analyzeEffectText("회피").keywords, ["DODGE"]);
});

test("액션별 Schema는 target 없는 드로우와 잘못된 값을 구분한다", () => {
  assert.equal(isStructuredEffects({ effects: [{ trigger: "ENTER_FIELD", action: "DRAW", values: { amount: 1 } }] }), true);
  assert.equal(isStructuredEffects({ effects: [{ trigger: "ENTER_FIELD", action: "DRAW", target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 }, values: { amount: 1 } }] }), false);
  assert.equal(isStructuredEffects({ effects: [{ trigger: "ENTER_FIELD", action: "ADD_KEYWORD", target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 } }] }), false);
});

test("연결된 절은 각 절의 숫자만 해당 액션에 바인딩한다", () => {
  const result = analyzeEffectText("등장: 적 선수 2장에게 피해 1 그리고 카드 1장 뽑기");
  assert.equal(result.status, "success");
  assert.deepEqual(result.effects.map((effect) => [effect.action, effect.target?.count, effect.values?.amount]), [
    ["DAMAGE", 2, 1],
    ["DRAW", undefined, 1],
  ]);
});

test("문서의 다음 턴 골드, 비용, 기절 문장을 분석한다", () => {
  for (const [text, action] of [
    ["등장: 다음 내 턴 골드 +1", "ADD_NEXT_TURN_GOLD"],
    ["등장: 손패의 선수 하나의 비용을 1 감소시킵니다.", "REDUCE_COST"],
    ["등장: 적 선수 하나를 1턴 동안 기절시킵니다.", "STUN"],
  ] as const) {
    const result = analyzeEffectText(text);
    assert.equal(result.status, "success", text);
    assert.equal(result.effects[0]?.action, action, text);
  }
});

test("KO 기본 메커니즘 어휘와 DSL 트리거를 새 메커니즘 요청 없이 분석한다", () => {
  const cases = [
    "등장: 자신에게 +2/+2", "조건: 내 손패에 Generated 선수가 있으면 등장: 카드 1장을 뽑습니다.",
    "태그: 피해 2", "준비: 카드 1장을 뽑습니다.", "콤보: 공격력 +1",
    "주문: 공격력 +1", "핀폴: 카드 1장을 뽑습니다.", "스위치: 왼쪽이면 +2/+2 오른쪽이면 +0/+2",
    "등장: 적 선수 하나를 포획합니다.", "등장: 적 선수 하나를 제거합니다.",
    "등장: 선수를 소환합니다.", "등장: 선수를 생성합니다.",
    "도발", "러쉬", "기습", "회피(2)", "침묵", "기절", "포획", "제거",
  ];
  for (const text of cases) {
    const result = analyzeEffectText(text);
    assert.equal(result.outcome, "supported", text);
    assert.equal(result.status, "success", text);
  }
  const needed = analyzeEffectText("조건: 내 손패에 Generated 선수가 있으면 등장: 카드 1장을 뽑습니다.");
  assert.equal(needed.effects[0]?.conditions?.[0]?.type, "NEED_CONDITION");
  const synergy = analyzeEffectText("태그: 피해 2");
  assert.ok(synergy.effects[0]?.conditions?.some((condition) => condition.type === "HAS_MATCHING_TAG_PLAYED_THIS_TURN"));
});