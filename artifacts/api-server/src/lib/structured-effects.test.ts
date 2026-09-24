import assert from "node:assert/strict";
import test from "node:test";

import { analyzeEffectText, effectLibrary, isEffectScriptConfig, isStructuredEffects } from "./structured-effects";

test("최신 보고서의 10개 원문은 공용 Analyzer에서 완전한 효과로 탈출한다", () => {
  const texts = [
    "1/1 '좀비'를 생성합니다.",
    "턴 시작:골드를 추가로 1 더 받습니다.",
    "턴 시작:선택한 아군 선수 카드를 리타이어시키고 그 카드의 체력과 공격력을 흡수합니다.",
    "선택한 무능력 선수 카드 1장에게 무작위 선수 카드의 텍스트를 부여합니다. 등장 효과일 경우 그 효과를 발동 시킵니다.",
    "등장:어디에 있든 '실험체' 태그가 달려있는 카드들에게 +1/+1을 부여합니다",
    "이 카드가 데미지를 입으면 1/1인 '좀비'를 소환합니다.",
    "이 카드의 체력이 증가하면 추가로 +1 증가합니다",
    "퇴장:'언데드' 태그가 있는 카드들에게 어디에 있든 최대 체력 +2를 부여합니다",
    "등장:필드에 '좀비'가 있다면 자신의 체력과 공격력에 필드에 있는 '좀비' 중 가장 수치의 합이 높은 '좀비'의 체력과 공격력을 더합니다.",
    "등장:선택한 선수에게 데미지를 1 줍니다. 이 효과로 상대 선수가 리타이어했다면 '늑대인간' 판도라로 변신합니다.",
  ];
  for (const text of texts) {
    const result = analyzeEffectText(text, {
      defaultTrigger: "ENTER_FIELD",
      cardCatalog: [
        { id: "zombie-id", name: "좀비", cardType: "WRESTLER", isToken: true, isChampionToken: false, attack: 1, health: 1 },
        { id: "wolf-id", name: "늑대인간 판도라", cardType: "WRESTLER", isToken: false, isChampionToken: false },
      ],
      availableTags: ["실험체", "언데드", "좀비"],
    });
    assert.equal(result.outcome, "supported", text);
    assert.ok(result.effects.length > 0, text);
    assert.equal(result.unsupportedSegments.length, 0, text);
    if (text.includes("늑대인간")) {
      assert.deepEqual(result.effects[1]?.values?.definitionRef, { id: "wolf-id" });
    }
  }
});

test("La Calavera revival preserves the graveyard filter and applies TAUNT to the revived instance", () => {
  const result = analyzeEffectText(
    "등장: 내 묘지에서 비용이 3 이하인 선수 카드 중 하나를 무작위로 부활시킵니다. 그 카드에게 도발을 부여합니다.",
  );

  assert.equal(result.status, "success");
  assert.deepEqual(result.effects.map((effect) => effect.action), ["REVIVE", "ADD_KEYWORD"]);
  assert.deepEqual(result.effects[0]?.target?.filter, { maxCost: 3 });
  assert.deepEqual(result.effects[1]?.target, {
    zone: "BOARD",
    owner: "SELF",
    selection: "SAME_TARGET",
    count: 1,
  });
  assert.deepEqual(result.effects[1]?.values, { keyword: "TAUNT" });
});

test("named transformations require one exact card definition and reject missing or ambiguous names", () => {
  const text = "등장: 선택한 선수에게 데미지를 1 줍니다. 이 효과로 상대 선수가 리타이어했다면 '늑대인간' 판도라로 변신합니다.";
  const exact = { id: "wolf-pandora-id", name: "늑대인간 판도라", cardType: "WRESTLER" as const, isToken: false, isChampionToken: false };
  const source = analyzeEffectText(text, { cardCatalog: [exact] });
  assert.equal(source.status, "success");
  assert.deepEqual(source.effects[1]?.values?.definitionRef, { id: exact.id });

  const missing = analyzeEffectText(text, {
    cardCatalog: [{ ...exact, id: "different-id", name: "늑대인간" }],
  });
  assert.equal(missing.outcome, "analysis_failure");
  assert.equal(missing.referenceErrors?.[0]?.code, "CARD_REFERENCE_NOT_FOUND");

  const ambiguous = analyzeEffectText(text, {
    cardCatalog: [exact, { ...exact, id: "duplicate-id" }],
  });
  assert.equal(ambiguous.outcome, "analysis_failure");
  assert.equal(ambiguous.referenceErrors?.[0]?.code, "CARD_REFERENCE_AMBIGUOUS");
});

test("Wirinom entry copy and self-retire summon resolve the same exact card", () => {
  const result = analyzeEffectText(
    "등장: 자신의 손패에 '위리녀'를 생성하고, 그 카드의 공격/체력을 이 카드의 현재 공격/체력과 같은 수치로 맞춥니다. 퇴장: 자신의 손패에 있는 '위리녀'를 필드에 소환합니다.",
    {
      cardCatalog: [
        { id: "wiriyeo-id", name: "위리녀", cardType: "WRESTLER", isToken: true, isChampionToken: false },
      ],
    },
  );

  assert.equal(result.status, "success");
  assert.deepEqual(result.effects.map(({ trigger, action }) => [trigger, action]), [
    ["ENTER_FIELD", "GENERATE"],
    ["SELF_RETIRE", "SUMMON_FROM_HAND"],
  ]);
  assert.deepEqual(result.effects[0]?.values?.definitionRef, { id: "wiriyeo-id" });
  assert.deepEqual(result.effects[0]?.values?.generatedModifiers, { copySourceStats: true });
  assert.deepEqual(result.effects[1]?.values?.definitionRef, { id: "wiriyeo-id" });
});

test("a stat-change keyword analyzer refuses to guess an unstated HAND/BOARD scope", () => {
  const result = analyzeEffectText("이 카드의 공격력이 처음 증가할 때, 회피 1회를 얻습니다.");
  assert.equal(result.outcome, "analysis_failure");
  assert.match(result.reason ?? "", /범위/);
});

test("ATTACK_SURVIVED cost reduction keeps the stated minimum cost", () => {
  const result = analyzeEffectText("상대 선수를 공격하고 생존하면 비용이 1 감소한 뒤 손패로 돌아옵니다. 최소 비용은 1입니다.");
  assert.equal(result.status, "success");
  assert.deepEqual(result.effects[0]?.values, { amount: 1, minimum: 1 });
});

test("바닐라 선수 대상의 무작위 카드 텍스트 부여 문장을 registry action으로 분석한다", () => {
  const result = analyzeEffectText(
    "등장: 바닐라 선수 하나에게 무작위 카드 텍스트를 부여합니다.",
  );
  assert.equal(result.status, "success");
  assert.deepEqual(result.effects?.map((effect) => effect.action), ["GRANT_RANDOM_CARD_TEXT"]);
  assert.deepEqual(result.effects?.[0]?.target, {
    zone: "BOARD",
    owner: "SELF",
    cardType: "WRESTLER",
    selection: "RANDOM",
    count: 1,
    filter: { isVanilla: true },
    randomScope: "STANDARD",
  });
  assert.equal(isStructuredEffects({ effects: result.effects }), true);
});

test("필수 카드 문장을 안전한 구조화 효과로 분석한다", () => {
  const cases = [
    {
      text: "등장: 자신에게 +2/+2를 부여합니다.",
      actions: ["BUFF"],
      target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
      values: { attack: 2, health: 2 },
    },
    {
      text: "등장: 자신의 현재 공격과 체력의 수치를 2배로 만듭니다.",
      actions: ["BUFF"],
      target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
      values: { attackMultiplier: 2, healthMultiplier: 2 },
    },
    {
      text: "액티브:자신의 현재 공격과 체력을의 수치 서로 교환합니다.",
      actions: ["SWAP_STATS"],
      target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
      values: undefined,
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
      target: { zone: "HAND", owner: "SELF", cardType: "WRESTLER", selection: "RANDOM", count: 3, randomScope: "STANDARD" },
      values: { attack: 1, health: 1 },
    },
    {
      text: "등장: 어디에 있든 모든 생성된 아군 선수 카드에게 체력과 공격을 1씩 증가시킵니다.",
      actions: ["BUFF"],
      target: { zones: ["HAND", "DECK", "BOARD"], owner: "SELF", cardType: "WRESTLER", filter: { isGenerated: true }, selection: "ALL", count: 20 },
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
      text: "등장: 적 대상 하나에게 피해 2를 줍니다.",
      actions: ["DAMAGE"],
      target: { zone: "CHARACTER", owner: "ENEMY", selection: "PLAYER_CHOICE", count: 1 },
      values: { amount: 2 },
    },
    {
      text: "등장: 대상 하나에게 피해 2를 줍니다.",
      actions: ["DAMAGE"],
      target: { zone: "CHARACTER", owner: "SELF", selection: "PLAYER_CHOICE", count: 1 },
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
    {
      text: "등장: 자신의 양 옆 빈 슬롯에 무작위 선수 카드를 각각 소환하고 그들에게 도발을 부여합니다. 이 카드가 필드에 있는 동안 생성된 카드가 주는 데미지가 2 증가합니다.",
      actions: ["SUMMON", "ADD_KEYWORD", "ADD_DAMAGE_MODIFIER"],
      target: { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", selection: "ADJACENT_EMPTY_SLOTS", count: 2, randomScope: "STANDARD" },
      values: undefined,
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

test("무덤 부활은 REVIVE와 비용 상한을 구조화한다", () => {
  const result = analyzeEffectText("등장: 내 무덤에서 비용이 3 이하인 선수 카드 하나를 무작위로 부활시킵니다.");
  assert.equal(result.status, "success");
  assert.deepEqual(result.effects.map((effect) => effect.action), ["REVIVE"]);
  assert.deepEqual(result.effects[0]?.target, {
    zone: "GRAVEYARD",
    owner: "SELF",
    cardType: "WRESTLER",
    selection: "RANDOM",
    count: 1,
    randomScope: "STANDARD",
    filter: { maxCost: 3 },
  });
  assert.equal(isStructuredEffects({ effects: result.effects }), true);
});

test("판도라식 자신이 선택한 대상은 선택 주체와 대상 소유자를 혼동하지 않는다", () => {
  const result = analyzeEffectText("등장: 자신이 선택한 선수를 침묵시키고 파괴합니다.");

  assert.equal(result.status, "success");
  assert.deepEqual(result.effects.map((effect) => effect.action), ["SILENCE", "DESTROY"]);
  assert.deepEqual(result.effects[0]?.target, {
    zone: "BOARD",
    owner: "ENEMY",
    cardType: "WRESTLER",
    selection: "PLAYER_CHOICE",
    count: 1,
  });
  assert.deepEqual(result.effects[1]?.target, {
    zone: "BOARD",
    owner: "ENEMY",
    cardType: "WRESTLER",
    selection: "SAME_TARGET",
    count: 1,
  });
});

test("손패의 선택한 선수 카드는 손패 WRESTLER 대상으로 유지한다", () => {
  const result = analyzeEffectText("등장: 손패의 선택한 선수 카드 한 장에게 +1/+1을 부여합니다.");

  assert.equal(result.status, "success");
  assert.deepEqual(result.effects[0]?.target, {
    zone: "HAND",
    owner: "SELF",
    cardType: "WRESTLER",
    selection: "PLAYER_CHOICE",
    count: 1,
  });
  assert.equal(isStructuredEffects({ effects: result.effects }), true);
});

test("판도라의 기본 문구는 상대 선수, 강화 문구는 상대 선수와 Champion을 고른다", () => {
  const wrestler = analyzeEffectText("자신이 선택한 선수에게 1 데미지를 줍니다.", { defaultTrigger: "ENTER_FIELD" });
  const character = analyzeEffectText("선택한 대상에게 피해를 1 줍니다.", { defaultTrigger: "ENTER_FIELD" });

  assert.deepEqual(wrestler.effects[0]?.target, {
    zone: "BOARD",
    owner: "ENEMY",
    cardType: "WRESTLER",
    selection: "PLAYER_CHOICE",
    count: 1,
  });
  assert.deepEqual(character.effects[0]?.target, {
    zone: "CHARACTER",
    owner: "ENEMY",
    selection: "PLAYER_CHOICE",
    count: 1,
  });
});

test("손에 있는 선수 카드 선택 문장은 손패 WRESTLER 단일 공격력 버프로 분석한다", () => {
  const result = analyzeEffectText(
    "손에 있는 선수 카드 하나를 선택하여 공격력을 2 올립니다.",
    { defaultTrigger: "ENTER_FIELD" },
  );

  assert.equal(result.status, "success");
  assert.deepEqual(result.effects[0]?.target, {
    zone: "HAND",
    owner: "SELF",
    cardType: "WRESTLER",
    selection: "PLAYER_CHOICE",
    count: 1,
  });
  assert.deepEqual(result.effects[0]?.values, { attack: 2, health: 0 });
});

test("판도라의 선택 대상 파괴와 공격력 합산은 하나의 검증된 효과 목록이 된다", () => {
  const result = analyzeEffectText(
    "등장: 자신이 선택한 선수를 침묵시키고 파괴합니다. 이 카드는 자신이 리타이어 혹은 파괴 시킨 선수의 공격력을 자신의 공격력에 더합니다.",
  );

  assert.equal(result.status, "success");
  assert.deepEqual(result.effects.map((effect) => effect.action), [
    "SILENCE",
    "DESTROY",
    "ADD_AGGREGATED_ATTACK",
  ]);
  assert.deepEqual(result.effects[2]?.target, {
    zone: "BOARD",
    owner: "SELF",
    selection: "SELF",
    count: 1,
  });
  assert.deepEqual(result.effects[2]?.values?.aggregateStats, {
    source: "LAST_DESTROYED_TARGETS",
    attack: "CURRENT_ATTACK_SUM",
    health: "CURRENT_HEALTH_SUM",
  });
  assert.equal(isStructuredEffects({ effects: result.effects }), true);
});

test("현재 공격력과 체력 교환의 유사 표현도 범용 SWAP_STATS로 분석한다", () => {
  const result = analyzeEffectText("액티브: 자신의 현재 공격력과 체력을 서로 바꿉니다.");

  assert.equal(result.status, "success");
  assert.equal(result.outcome, "supported");
  assert.deepEqual(result.effects[0], {
    trigger: "ACTIVE",
    action: "SWAP_STATS",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
});

test("양옆 무작위 소환과 생성 카드 피해 보정을 각각 구조화한다", () => {
  const result = analyzeEffectText(
    "등장: 자신의 양옆 빈 슬롯에 3 코스트 이상의 무작위 선수 카드를 각각 소환합니다. 이 카드가 필드에 있을때 생성된 카드들이 1 추가 데미지를 줍니다.",
  );

  assert.equal(result.status, "success");
  assert.deepEqual(result.effects[0]?.target, {
    zone: "BOARD",
    owner: "SELF",
    cardType: "WRESTLER",
    filter: { minCost: 3 },
    selection: "ADJACENT_EMPTY_SLOTS",
    count: 2,
    randomScope: "STANDARD",
  });
  assert.deepEqual(result.effects[1], {
    trigger: "ENTER_FIELD",
    action: "ADD_DAMAGE_MODIFIER",
    values: { amount: 1, damageSource: "GENERATED" },
  });
});

test("정확한 양옆의 빈 슬롯 문장을 무작위 소환과 직전 결과 키워드로 구조화한다", () => {
  const result = analyzeEffectText(
    "등장: 이 카드 양옆의 빈 슬롯에 각각 무작위 선수 카드 1장을 소환하고, 그렇게 소환된 선수들에게 도발을 부여한다.",
  );

  assert.equal(result.status, "success");
  assert.deepEqual(result.effects.map((effect) => effect.action), ["SUMMON", "ADD_KEYWORD"]);
  assert.deepEqual(result.effects[0]?.target, {
    zone: "BOARD",
    owner: "SELF",
    cardType: "WRESTLER",
    selection: "ADJACENT_EMPTY_SLOTS",
    count: 2,
    randomScope: "STANDARD",
  });
  assert.deepEqual(result.effects[1]?.target, {
    zone: "BOARD",
    owner: "SELF",
    cardType: "WRESTLER",
    selection: "SAME_TARGET",
    count: 2,
  });
  assert.deepEqual(result.effects[1]?.values, { keyword: "TAUNT" });
  assert.equal(isStructuredEffects({ effects: result.effects }), true);
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

test("무작위와 완전히 무작위를 서로 다른 Random Scope로 분석한다", () => {
  const standard = analyzeEffectText("등장: 무작위 선수 카드 1장을 생성합니다.");
  assert.equal(standard.outcome, "supported");
  assert.deepEqual(standard.effects[0]?.target, {
    zones: ["HAND", "DECK", "BOARD"],
    owner: "SELF",
    cardType: "WRESTLER",
    selection: "RANDOM",
    count: 1,
    randomScope: "STANDARD",
  });
  assert.equal(isStructuredEffects({ effects: standard.effects }), true);

  for (const wording of ["완전히 무작위", "완전 무작위", "완전 랜덤"]) {
    const full = analyzeEffectText(`등장: ${wording} 선수 카드 1장을 생성합니다.`);
    assert.equal(full.outcome, "supported", wording);
    assert.equal(full.effects[0]?.target?.randomScope, "FULL", wording);
    assert.equal(full.effects[0]?.target?.cardType, "WRESTLER", wording);
    assert.equal(full.effects[0]?.target?.selection, "RANDOM", wording);
    assert.equal(isStructuredEffects({ effects: full.effects }), true, wording);
  }

  const technique = analyzeEffectText("등장: 완전히 무작위 기술 카드 1장을 생성합니다.");
  assert.equal(technique.effects[0]?.target?.cardType, "TECHNIQUE");
  assert.equal(technique.effects[0]?.target?.randomScope, "FULL");
});

test("현재 registry에서 제공하는 Effect Library 메타데이터를 노출한다", () => {
  const library = effectLibrary();
  assert.ok(library.actions.length >= 19);
  assert.deepEqual(library.actions.find((action) => action.name === "DAMAGE")?.requiredConfig, { target: true, values: { amount: "number (0..999)" } });
  assert.ok(library.triggers.every((trigger) => trigger.status === "ACTIVE"));
  assert.ok(library.targetResolvers.length > 0);
  assert.ok(library.valueResolvers.length > 0);
  assert.deepEqual(
    library.valueResolvers.find((resolver) => resolver.name === "STAT_MULTIPLIER")?.config,
    { attackMultiplier: "number (0..10)", healthMultiplier: "number (0..10)" },
  );
  assert.deepEqual(library.targetResolvers[0]?.config.defaultCardScope, ["HAND", "DECK", "BOARD"]);
  assert.ok(library.targetResolvers[0]?.config.filter);
  assert.equal("filters" in (library.targetResolvers[0]?.config ?? {}), false);
  assert.equal("tagFilters" in (library.targetResolvers[0]?.config ?? {}), false);
  assert.deepEqual(library.targetResolvers[0]?.config.randomScope, ["STANDARD", "FULL"]);
  assert.ok(library.actions.some((action) => action.name === "SET_STATS"));
  assert.deepEqual(
    library.valueResolvers.find((resolver) => resolver.name === "REFERENCE_STAT")?.config,
    { reference: ["SOURCE", "LAST_TARGET", "LAST_DRAWN_CARD", "LAST_ATTACKER", "LAST_DAMAGED_TARGET", "CAPTURED_CARD", "CURRENT_SLOT"], referenceStat: ["CURRENT_ATTACK", "CURRENT_HEALTH"] },
  );
});

test("나토마토의 콤보 참조와 턴 종료 초기화를 각각 구조화한다", () => {
  const result = analyzeEffectText("콤보:공격한 아군 선수의 공격력만큼 자신의 공격력을 증가시킵니다. 턴종료:자신의 공격력을 0으로 만듭니다.");

  assert.equal(result.status, "success");
  assert.equal(result.outcome, "supported");
  assert.deepEqual(result.effects, [
    {
      trigger: "OTHER_ALLY_ATTACK",
      action: "BUFF",
      target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
      values: { reference: "LAST_ATTACKER", referenceStat: "CURRENT_ATTACK" },
    },
    {
      trigger: "TURN_END",
      action: "SET_STATS",
      target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
      values: { attack: 0 },
    },
  ]);
  assert.equal(isStructuredEffects({ effects: result.effects }), true);
});

test("보드바의 자신 공격 Trigger와 다음 턴 골드 효과를 구조화한다", () => {
  const result = analyzeEffectText("이 카드가 공격할 때마다 다음 내 턴에 골드를 추가로 +1G 받습니다.");

  assert.equal(result.status, "success");
  assert.equal(result.outcome, "supported");
  assert.deepEqual(result.effects, [
    {
      trigger: "SELF_ATTACK",
      action: "ADD_NEXT_TURN_GOLD",
      values: { amount: 1 },
    },
  ]);
  assert.equal(isStructuredEffects({ effects: result.effects }), true);

  const paraphrase = analyzeEffectText("자신이 공격할 때마다 다음 내 턴 골드 +1");
  assert.equal(paraphrase.status, "success");
  assert.deepEqual(paraphrase.effects[0], {
    trigger: "SELF_ATTACK",
    action: "ADD_NEXT_TURN_GOLD",
    values: { amount: 1 },
  });
});

test("뒷정리맨의 다음 아군 선수 체력 예약을 구조화하고 지속 문장을 무시한다", () => {
  const result = analyzeEffectText("등장: 다음에 내가 내는 아군 선수 카드 1장이 체력이 2 증가합니다. 사용될 때까지 턴을 넘어도 유지합니다.");

  assert.equal(result.status, "success");
  assert.equal(result.outcome, "supported");
  assert.deepEqual(result.effects, [
    {
      trigger: "ENTER_FIELD",
      action: "QUEUE_EFFECT",
      values: {
        queuedTrigger: "NEXT_ALLY_WRESTLER_PLAYED",
        queuedEffect: {
          action: "BUFF",
          target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
          values: { attack: 0, health: 2 },
        },
      },
    },
  ]);
  assert.equal(isStructuredEffects({ effects: result.effects }), true);
});

test("최신 보고서의 미분석 문장도 기존 범용 효과로 구조화한다", () => {
  const queued = analyzeEffectText("출현:다음에 출현하는 카드에게 체력을 +2 부여합니다.");
  assert.deepEqual(queued.effects, [{
    trigger: "ENTER_FIELD",
    action: "QUEUE_EFFECT",
    values: {
      queuedTrigger: "NEXT_ALLY_WRESTLER_PLAYED",
      queuedEffect: {
        action: "BUFF",
        target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
        values: { attack: 0, health: 2 },
      },
    },
  }]);

  const steal = analyzeEffectText("이 카드가 공격할때마다 상대 덱에서 무작위 카드 1장을 내 손으로 훔쳐옵니다.");
  assert.deepEqual(steal.effects, [{
    trigger: "SELF_ATTACK",
    action: "STEAL",
    target: { zone: "DECK", owner: "ENEMY", selection: "RANDOM", count: 1, randomScope: "STANDARD" },
  }]);

  const adjacent = analyzeEffectText("등장: 양옆의 아군 선수들에게 도발을 부여합니다.");
  assert.deepEqual(adjacent.effects[0], {
    trigger: "ENTER_FIELD",
    action: "ADD_KEYWORD",
    target: { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", selection: "ADJACENT", count: 2 },
    values: { keyword: "TAUNT" },
  });

  const excludedBuff = analyzeEffectText("등장:자신을 제외한 필드에 나와있는 아군 선수들에게 공격력 및 체력에 +2를 부여합니다.");
  assert.deepEqual(excludedBuff.effects[0]?.target?.filter, { excludeSource: true });
  assert.deepEqual(excludedBuff.effects[0]?.values, { attack: 2, health: 2 });

  const turnStart = analyzeEffectText("턴 시작:골드를 추가로 1 더 받습니다.");
  assert.deepEqual(turnStart.effects, [{
    trigger: "TURN_START",
    action: "ADD_GOLD",
    values: { amount: 1 },
  }]);

  const zombieId = "66143efe-2eec-450a-8570-9a4c4d92330e";
  const zombieCatalog = [{
    id: zombieId,
    name: "좀비",
    cardType: "WRESTLER" as const,
    isToken: false,
    isChampionToken: false,
  }];
  const zombie = analyzeEffectText(
    "등장:묘지에 있는 비용이 3 이하인 무작위 카드 한장의 공격력과 체력이랑 똑같은 수치의 '좀비'를 하나 소환합니다.",
    { cardCatalog: zombieCatalog },
  );
  assert.equal(zombie.status, "success");
  assert.equal(zombie.outcome, "supported");
  assert.deepEqual(zombie.effects.map((effect) => effect.action), ["SUMMON"]);
  assert.deepEqual(zombie.effects[0]?.target, {
    zone: "GRAVEYARD",
    owner: "SELF",
    filter: { maxCost: 3 },
    selection: "RANDOM",
    count: 1,
    randomScope: "STANDARD",
  });
  assert.deepEqual(zombie.effects[0]?.values?.definitionRef, { id: zombieId });
  assert.deepEqual(zombie.effects[0]?.values?.generatedModifiers, { copyTargetStats: true });
  assert.equal(isStructuredEffects({ effects: zombie.effects }), true);

  const ambiguousZombie = analyzeEffectText(
    "등장:묘지에 있는 비용이 3 이하인 무작위 카드 한장의 공격력과 체력이랑 똑같은 수치의 '좀비'를 하나 소환합니다.",
    { cardCatalog: [...zombieCatalog, { ...zombieCatalog[0]!, id: "duplicate-zombie" }] },
  );
  assert.equal(ambiguousZombie.outcome, "analysis_failure");
  assert.equal(ambiguousZombie.referenceErrors?.[0]?.code, "CARD_REFERENCE_AMBIGUOUS");

  const missingZombie = analyzeEffectText(
    "등장:묘지에 있는 비용이 3 이하인 무작위 카드 한장의 공격력과 체력이랑 똑같은 수치의 '좀비'를 하나 소환합니다.",
    { cardCatalog: [] },
  );
  assert.equal(missingZombie.outcome, "analysis_failure");
  assert.equal(missingZombie.referenceErrors?.[0]?.code, "CARD_REFERENCE_NOT_FOUND");

  const explicitlyTauntedZombie = analyzeEffectText(
    "등장:묘지에 있는 3코스트 이하 무작위 카드 한장의 공격력과 체력만큼 '좀비'를 소환하고, 그 좀비에게 도발을 부여합니다.",
    { cardCatalog: zombieCatalog },
  );
  assert.deepEqual(explicitlyTauntedZombie.effects.map((effect) => effect.action), ["SUMMON", "ADD_KEYWORD"]);
});

test("Champion의 자연스러운 다음 턴 골드 문장을 부분 분석 없이 구조화한다", () => {
  const result = analyzeEffectText("다음 턴에 골드를 추가로 1 더 받습니다", {
    defaultTrigger: "ENTER_FIELD",
  });

  assert.equal(result.status, "success");
  assert.equal(result.outcome, "supported");
  assert.deepEqual(result.effects, [
    {
      trigger: "ENTER_FIELD",
      action: "ADD_NEXT_TURN_GOLD",
      values: { amount: 1 },
    },
  ]);
  assert.deepEqual(result.unsupportedSegments, []);
  assert.equal(isStructuredEffects({ effects: result.effects }), true);
});

test("생성된 아군 선수의 공격력과 체력을 함께 증가시키는 유사 표현도 분석한다", () => {
  const result = analyzeEffectText("등장: 모든 위치의 생성된 내 선수 카드의 공격력과 체력을 1씩 올립니다.");

  assert.equal(result.status, "success");
  assert.equal(result.outcome, "supported");
  assert.deepEqual(result.effects[0], {
    trigger: "ENTER_FIELD",
    action: "BUFF",
    target: {
      zones: ["HAND", "DECK", "BOARD"],
      owner: "SELF",
      cardType: "WRESTLER",
      filter: { isGenerated: true },
      selection: "ALL",
      count: 20,
    },
    values: { attack: 1, health: 1 },
  });
});

test("어디에 있든 생성된 선수는 HAND·DECK·BOARD와 Generated 필터로 분석한다", () => {
  for (const wording of ["어디에 있든", "어디에 있는", "모든 위치의"]) {
    const result = analyzeEffectText(`등장: ${wording} 생성된 선수 카드에게 +1/+1을 부여합니다.`);
    assert.equal(result.status, "success", wording);
    assert.equal(result.outcome, "supported", wording);
    assert.deepEqual(result.effects[0]?.target, {
      zones: ["HAND", "DECK", "BOARD"],
      owner: "SELF",
      cardType: "WRESTLER",
      filter: { isGenerated: true },
      selection: "ALL",
      count: 20,
    }, wording);
    assert.equal(isStructuredEffects({ effects: result.effects }), true, wording);
  }
});

test("덱 단일 영역의 생성 카드 비용 효과도 Generated 필터로 분석한다", () => {
  const result = analyzeEffectText("등장: 덱의 생성된 카드 비용을 -1 감소시킵니다.");
  assert.equal(result.status, "success");
  assert.deepEqual(result.effects[0]?.target, {
    zone: "DECK",
    owner: "SELF",
    filter: { isGenerated: true },
    selection: "PLAYER_CHOICE",
    count: 1,
  });
  assert.equal(result.effects[0]?.action, "REDUCE_COST");
  assert.equal(isStructuredEffects({ effects: result.effects }), true);
});

test("손패의 무작위 선수 한 장에게 공격력과 체력을 함께 증가시키는 Champion 효과를 지원한다", () => {
  const result = analyzeEffectText(
    "손패에 있는 선수 카드 중 무작위 한장의 체력과 공격을 1씩 증가시킨다.",
    { defaultTrigger: "ENTER_FIELD" },
  );

  assert.equal(result.status, "success");
  assert.equal(result.outcome, "supported");
  assert.deepEqual(result.effects, [
    {
      trigger: "ENTER_FIELD",
      action: "BUFF",
      target: {
        zone: "HAND",
        owner: "SELF",
        cardType: "WRESTLER",
        selection: "RANDOM",
        count: 1,
        randomScope: "STANDARD",
      },
      values: { attack: 1, health: 1 },
    },
  ]);
  assert.deepEqual(result.unsupportedSegments, []);
  assert.equal(isStructuredEffects({ effects: result.effects }), true);
});

test("손패·덱·필드 표현은 공통 세 Zone 범위로 분석한다", () => {
  const result = analyzeEffectText("등장: 손패, 덱, 필드의 생성된 선수에게 +1/+1을 줍니다.");
  assert.equal(result.status, "success");
  assert.deepEqual(result.effects[0]?.target?.zones, ["HAND", "DECK", "BOARD"]);
  assert.equal(result.effects[0]?.target?.filter?.isGenerated, true);
});

test("인식 가능한 신규 메커니즘은 부분 적용 없이 필요 상태로 분류한다", () => {
  const result = analyzeEffectText("등장: 내 손패의 모든 선수 카드의 공격력을 서로 무작위로 섞습니다.");
  assert.equal(result.outcome, "mechanism_required");
  assert.equal(result.status, "partial");
  assert.equal(result.effects.length, 0);
  assert.ok(result.unsupportedSegments.some((segment) => segment.includes("섞")));
});

test("손패 공격력 재배열은 분석 실패가 아닌 구체적인 메커니즘 요청으로 안내한다", () => {
  const result = analyzeEffectText("등장: 내 손패 모든 선수의 공격력을 서로 무작위로 섞습니다.");
  assert.equal(result.outcome, "mechanism_required");
  assert.equal(result.status, "partial");
  assert.ok(result.unsupportedSegments.includes("손패 여러 카드의 공격력 값을 서로 섞는 기능"));
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
  assert.equal(
    isStructuredEffects({
      effects: [{
        trigger: "ENTER_FIELD",
        action: "BUFF",
        target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
        values: { attackMultiplier: 11, healthMultiplier: 2 },
      }],
    }),
    false,
  );
  assert.equal(
    isStructuredEffects({
      effects: [{
        trigger: "ENTER_FIELD",
        action: "BUFF",
        target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
        values: { attackMultiplier: 2 },
      }],
    }),
    false,
  );
  assert.equal(
    isStructuredEffects({
      effects: [{
        trigger: "ENTER_FIELD",
        action: "BUFF",
        target: {
          zones: ["HAND", "DECK", "BOARD"],
          owner: "SELF",
          selection: "ALL",
          count: 20,
          filter: { isGenerated: true },
        },
        values: { attack: 1, health: 1 },
      }],
    }),
    true,
  );
  assert.equal(
    isStructuredEffects({
      effects: [{
        trigger: "ENTER_FIELD",
        action: "BUFF",
        target: {
          zone: "GRAVEYARD",
          owner: "SELF",
          selection: "ALL",
          count: 20,
          filter: { isGenerated: true },
        },
        values: { attack: 1, health: 1 },
      }],
    }),
    true,
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

test("Champion effect context는 Trigger 없는 효과 본문을 공용 DSL로 분석한다", () => {
  const damage = analyzeEffectText("적 선수 카드 1장에게 피해 1", { defaultTrigger: "ENTER_FIELD" });
  assert.equal(damage.outcome, "supported");
  assert.deepEqual(damage.effects[0], {
    trigger: "ENTER_FIELD",
    action: "DAMAGE",
    target: { zone: "BOARD", owner: "ENEMY", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 },
    values: { amount: 1 },
  });

  const buff = analyzeEffectText("내 손의 선수 카드 1장에게 +1/+1", { defaultTrigger: "ENTER_FIELD" });
  assert.equal(buff.outcome, "supported");
  assert.deepEqual(buff.effects[0], {
    trigger: "ENTER_FIELD",
    action: "BUFF",
    target: { zone: "HAND", owner: "SELF", cardType: "WRESTLER", selection: "PLAYER_CHOICE", count: 1 },
    values: { attack: 1, health: 1 },
  });
  assert.equal(isStructuredEffects({ effects: buff.effects }), true);
});

test("챔피언 소환 문구는 일반 SUMMON과 분리된 DEPLOY_CHAMPION_TOKEN으로 분석한다", () => {
  for (const text of ["챔피언을 소환합니다.", "챔피언을 소환한다.", "내 챔피언을 소환합니다."]) {
    const result = analyzeEffectText(text, { defaultTrigger: "ENTER_FIELD" });
    assert.equal(result.outcome, "supported", text);
    assert.equal(result.effects.length, 1, text);
    assert.deepEqual(result.effects[0], {
      trigger: "ENTER_FIELD",
      action: "DEPLOY_CHAMPION_TOKEN",
    }, text);
  }
});

test("따옴표로 참조한 Champion Token 한 장 소환 문장을 완전한 SUMMON으로 분석한다", () => {
  const catalog = [
    { id: "mercenary", name: "용병", cardType: "WRESTLER" as const, isToken: true, isChampionToken: false },
  ];
  const result = analyzeEffectText("'용병'을 하나 소환한다.", {
    defaultTrigger: "ENTER_FIELD",
    cardCatalog: catalog,
  });

  assert.equal(result.status, "success");
  assert.equal(result.outcome, "supported");
  assert.deepEqual(result.effects[0], {
    trigger: "ENTER_FIELD",
    action: "SUMMON",
    values: { definitionRef: { id: "mercenary" }, count: 1 },
  });
  assert.deepEqual(result.unsupportedSegments, []);
});

test("현재 공격/체력 배수 표현은 같은 범용 BUFF Resolver로 분석한다", () => {
  for (const text of [
    "등장: 자신의 현재 공격과 체력의 수치를 2배로 만듭니다.",
    "등장: 자신에게 공격력과 체력을 2배로 합니다.",
  ]) {
    const result = analyzeEffectText(text);
    assert.equal(result.status, "success", text);
    assert.equal(result.effects[0]?.action, "BUFF", text);
    assert.deepEqual(result.effects[0]?.values, { attackMultiplier: 2, healthMultiplier: 2 }, text);
    assert.equal(isStructuredEffects({ effects: result.effects }), true, text);
  }
});

test("액션별 Schema는 target 없는 드로우와 잘못된 값을 구분한다", () => {
  assert.equal(isStructuredEffects({ effects: [{ trigger: "ENTER_FIELD", action: "DRAW", values: { amount: 1 } }] }), true);
  assert.equal(isStructuredEffects({ effects: [{ trigger: "ENTER_FIELD", action: "DRAW", target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 }, values: { amount: 1 } }] }), false);
  assert.equal(isStructuredEffects({ effects: [{ trigger: "ENTER_FIELD", action: "ADD_KEYWORD", target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 } }] }), false);
});

test("generic target DSL accepts any/all/none card tag filters and rejects invalid lists", () => {
  const target = { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", selection: "ALL", count: 20 };
  assert.equal(isStructuredEffects({
    effects: [{
      trigger: "ENTER_FIELD",
      action: "BUFF",
      target: { ...target, filter: { tagsAny: ["용병", "인간"] } },
      values: { attack: 1, health: 1 },
    }],
  }), true);
  assert.equal(isStructuredEffects({
    effects: [{
      trigger: "ENTER_FIELD",
      action: "BUFF",
      target: { ...target, filter: { tagsAll: ["용병", "인간"], tagsNone: ["언데드"] } },
      values: { attack: 1, health: 1 },
    }],
  }), true);
  assert.equal(isStructuredEffects({
    effects: [{
      trigger: "ENTER_FIELD",
      action: "BUFF",
      target: { ...target, filter: { tagsAny: [""] } },
      values: { attack: 1, health: 1 },
    }],
  }), false);
});

test("tag target phrases analyze into a reusable tagsAny filter", () => {
  const result = analyzeEffectText("등장: 내 필드의 용병 또는 인간 태그를 가진 선수에게 +1/+1");
  assert.equal(result.status, "success");
  assert.deepEqual(result.effects[0]?.target?.filter, { tagsAny: ["용병", "인간"] });
  assert.equal(isStructuredEffects({ effects: result.effects }), true);
});

test("natural tag vocabulary supports implicit, negative, and all-tag Korean phrasing", () => {
  const vocabulary = ["좀비", "인간", "용병"];
  const implicit = analyzeEffectText("등장: 좀비인 선수에게 +1/+1", { availableTags: vocabulary });
  assert.deepEqual(implicit.effects[0]?.target?.filter, { tagsAny: ["좀비"] });

  const negative = analyzeEffectText("등장: 좀비 태그가 없는 선수에게 +1/+1", { availableTags: vocabulary });
  assert.deepEqual(negative.effects[0]?.target?.filter, { tagsNone: ["좀비"] });

  const all = analyzeEffectText("등장: 좀비와 인간 태그를 모두 가진 선수에게 +1/+1", { availableTags: vocabulary });
  assert.deepEqual(all.effects[0]?.target?.filter, { tagsAll: ["좀비", "인간"] });
});

test("structured target ordering is bounded and rejects unknown target predicates", () => {
  const target = { zone: "BOARD", owner: "SELF", cardType: "WRESTLER", selection: "TOP", count: 1, sort: { stat: "ATTACK", direction: "DESC" }, take: 1 };
  assert.equal(isStructuredEffects({
    effects: [{ trigger: "ENTER_FIELD", action: "BUFF", target, values: { attack: 1, health: 1 } }],
  }), true);
  assert.equal(isStructuredEffects({
    effects: [{ trigger: "ENTER_FIELD", action: "BUFF", target: { ...target, take: 21 }, values: { attack: 1, health: 1 } }],
  }), false);
  assert.equal(isStructuredEffects({
    effects: [{ trigger: "ENTER_FIELD", action: "BUFF", target: { ...target, predicate: "highest" }, values: { attack: 1, health: 1 } }],
  }), false);
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

test("비용·공격력·체력의 signed generic stat 표현을 순서대로 분석한다", () => {
  const naturalCost = analyzeEffectText("등장: 비용이 1 감소합니다.");
  assert.deepEqual(naturalCost.effects[0]?.values, { stat: "COST", amount: -1 });

  const result = analyzeEffectText("등장: 비용이 1 감소하고 +2/+2를 얻습니다.");
  assert.equal(result.status, "success");
  assert.deepEqual(result.effects.map((effect) => [effect.action, effect.values?.stat, effect.values?.amount]), [
    ["MODIFY_STAT", "COST", -1],
    ["MODIFY_STAT", "ATTACK", 2],
    ["MODIFY_STAT", "HEALTH", 2],
  ]);

  const compound = analyzeEffectText("등장: 비용 +1, 공격력 +3, 체력 +2");
  assert.deepEqual(compound.effects.map((effect) => [effect.values?.stat, effect.values?.amount]), [
    ["COST", 1],
    ["ATTACK", 3],
    ["HEALTH", 2],
  ]);
});

test("generic stat parser는 SET, 최소 비용, 지속시간을 구분한다", () => {
  const result = analyzeEffectText("등장: 공격력/체력이 4/6이 됩니다.");
  assert.deepEqual(result.effects.map((effect) => [effect.action, effect.values?.stat, effect.values?.amount]), [
    ["SET_STAT", "ATTACK", 4],
    ["SET_STAT", "HEALTH", 6],
  ]);

  const temporary = analyzeEffectText("등장: 이번 턴 비용 -1 (최소 비용 1)");
  assert.deepEqual(temporary.effects[0]?.values, {
    stat: "COST",
    amount: -1,
    duration: "THIS_TURN",
    minimum: 1,
  });

  const permanent = analyzeEffectText("등장: 영구적으로 공격력 +1");
  assert.equal(permanent.effects[0]?.values?.duration, "PERMANENT");
});

test("파괴 대상의 스탯 합산을 가진 좀비를 소환하고 명시한 도발을 부여한다", () => {
  const result = analyzeEffectText("등장:내 필드에 있는 모든 생성된 카드를 파괴시킵니다. 그 카드들의 현재 공격과 체력의 수치를 합산한 수치를 가진 '좀비'를 1장 소환합니다. 소환한 '좀비'에게 도발을 부여합니다");
  assert.equal(result.status, "success");
  assert.equal(result.outcome, "supported");
  assert.deepEqual(result.effects.map((effect) => effect.action), ["DESTROY", "SUMMON", "ADD_KEYWORD"]);
  assert.deepEqual(result.effects[1]?.values?.aggregateStats, {
    source: "LAST_DESTROYED_TARGETS",
    attack: "CURRENT_ATTACK_SUM",
    health: "CURRENT_HEALTH_SUM",
  });
  assert.deepEqual(result.effects[1]?.values?.definitionRef, { name: "좀비" });
  assert.deepEqual(result.effects[2]?.target, { zone: "BOARD", owner: "SELF", selection: "SAME_TARGET", count: 1 });
  assert.equal(isStructuredEffects({ effects: result.effects }), true);
});

test("명시한 카드명은 CardDefinition ID로 연결되고 이름 변경에도 ID가 유지된다", () => {
  const catalog = [
    { id: "token-old-id", name: "잔상", cardType: "WRESTLER" as const, isToken: true, isChampionToken: false },
  ];
  const result = analyzeEffectText("등장: 잔상을 2장 소환합니다.", { cardCatalog: catalog });
  assert.equal(result.outcome, "supported");
  assert.deepEqual(result.effects[0]?.values?.definitionRef, { id: "token-old-id" });
  assert.equal(result.effects[0]?.values?.count, 2);
  assert.deepEqual(result.referencedCards, [catalog[0]]);

  const renamed = analyzeEffectText("등장: 잔상+", { cardCatalog: [{ ...catalog[0], name: "잔상+" }] });
  assert.equal(renamed.outcome, "analysis_failure");
  const renamedReference = analyzeEffectText("등장: 잔상+을 소환합니다.", { cardCatalog: [{ ...catalog[0], name: "잔상+" }] });
  assert.deepEqual(renamedReference.effects[0]?.values?.definitionRef, { id: "token-old-id" });
});

test("명시 카드가 없거나 동명이인이면 임의 카드를 고르지 않는다", () => {
  const notFound = analyzeEffectText("등장: 없는 잔상을 소환합니다.", {
    cardCatalog: [{ id: "known", name: "잔상", cardType: "WRESTLER", isToken: true, isChampionToken: false }],
  });
  assert.equal(notFound.outcome, "analysis_failure");
  assert.equal(notFound.referenceErrors?.[0]?.code, "CARD_REFERENCE_NOT_FOUND");

  const ambiguous = analyzeEffectText("등장: 잔상을 소환합니다.", {
    cardCatalog: [
      { id: "one", name: "잔상", cardType: "WRESTLER", isToken: true, isChampionToken: false },
      { id: "two", name: "잔상", cardType: "WRESTLER", isToken: true, isChampionToken: false },
    ],
  });
  assert.equal(ambiguous.outcome, "analysis_failure");
  assert.equal(ambiguous.referenceErrors?.[0]?.code, "CARD_REFERENCE_AMBIGUOUS");
  assert.equal(ambiguous.effects.length, 0);
});

test("명시 카드 생성은 손패와 덱 destination을 보존한다", () => {
  const catalog = [{ id: "named-card", name: "지원 카드", cardType: "TECHNIQUE" as const, isToken: false, isChampionToken: false }];
  const hand = analyzeEffectText("등장: 지원 카드를 손에 생성합니다.", { cardCatalog: catalog });
  const deck = analyzeEffectText("등장: 지원 카드를 덱에 생성합니다.", { cardCatalog: catalog });
  assert.equal(hand.outcome, "supported");
  assert.equal(hand.effects[0]?.action, "GENERATE");
  assert.equal(hand.effects[0]?.values?.destination, "HAND");
  assert.deepEqual(hand.effects[0]?.values?.definitionRef, { id: "named-card" });
  assert.equal(deck.effects[0]?.values?.destination, "DECK");
  assert.deepEqual(deck.effects[0]?.values?.definitionRef, { id: "named-card" });
});

test("기준 능력치가 적힌 생성은 일치하는 CardDefinition을 손패에 생성한다", () => {
  const catalog = [{
    id: "zombie",
    name: "좀비",
    cardType: "WRESTLER" as const,
    isToken: false,
    isChampionToken: false,
    attack: 1,
    health: 1,
  }];
  const result = analyzeEffectText("1/1 '좀비'를 생성합니다.", {
    defaultTrigger: "ENTER_FIELD",
    cardCatalog: catalog,
  });
  assert.equal(result.outcome, "supported");
  assert.deepEqual(result.effects, [{
    trigger: "ENTER_FIELD",
    action: "GENERATE",
    values: { definitionRef: { id: "zombie" }, destination: "HAND", count: 1 },
  }]);
  assert.deepEqual(result.referencedCards, [catalog[0]]);

  const mismatchedStats = analyzeEffectText("1/1 '좀비'를 생성합니다.", {
    defaultTrigger: "ENTER_FIELD",
    cardCatalog: [{ ...catalog[0]!, attack: 2 }],
  });
  assert.equal(mismatchedStats.outcome, "analysis_failure");
  assert.equal(mismatchedStats.effects.length, 0);

  const missingCatalog = analyzeEffectText("1/1 '좀비'를 생성합니다.", { defaultTrigger: "ENTER_FIELD" });
  assert.equal(missingCatalog.outcome, "analysis_failure");
  assert.equal(missingCatalog.effects.length, 0);
});

test("KO 기본 메커니즘 어휘와 DSL 트리거를 새 메커니즘 요청 없이 분석한다", () => {
  const cases = [
    "등장: 자신에게 +2/+2", "조건: 내 손패에 Generated 선수가 있으면 등장: 카드 1장을 뽑습니다.",
    "준비: 카드 1장을 뽑습니다.", "콤보: 공격력 +1",
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
  const removedLegacyTagTrigger = analyzeEffectText("태그: 피해 2");
  assert.equal(removedLegacyTagTrigger.status, "failure");
});

test("WRESTLER 17종 원문을 완전한 구조화 효과로 분석한다", () => {
  const texts = [
    "등장:어디에 있든 모든 생성된 아군 선수 카드에게 체력과 공격을 각각 1씩 증가시킵니다.",
    "등장: 다음에 내가 플레이하는 아군 선수 카드 1장이 체력이 +2 증가합니다. 사용될 때까지 턴을 넘어도 유지합니다.",
    "자신의 무덤의 선수 카드의 수 만큼 공격력과 체력이 증가합니다.",
    "이 카드를 처음으로 공격한 적 선수는 공격 이후 침묵됩니다. 이후 이 카드의 능력을 비활성화합니다.",
    "등장:현재 내 손패에 있는 카드 수만큼 체력과 공격을 +1 증가시킵니다.",
    "손패에 있을 때 아군 선수가 리타이어할 때마다 비용이 -1G 씩 감소한다. (최소 비용 1G)",
    "등장:내 덱 맨 위에 있는 카드를 파괴하고, 비용/체력/공격을 1씩 깎은 무작위 카드를 덱 맨 위에 추가합니다.(챔피언 토큰 제외)(비용/체력/공격 수치는 최소 1)",
    "턴 시작:이 카드가 내 필드의 유일한 선수라면 이 턴에 추가로 +1G를 받습니다.",
    "등장: 손패의 무작위 선수 카드 3장에게 공격과 체력을 둘다 +1 증가시킵니다. 3장 미만이면 가능한 카드 전부에게 줍니다.",
    "묘지에서 선수 1장을 선택하고, 그 선수를 패로 되돌립니다.",
    "등장: 내 덱 위 카드 3장을 무덤으로 보내고, 다음턴에 골드를 추가로 +1G를 받습니다.",
    "등장:자신의 손패에 '위리녀'를 생성하고, 그 카드의 공격/체력을 이 카드의 현재 공격/체력과 같은 수치로 맞춥니다. 퇴장:자신의 손패에 있는 '위리녀' 1장을 필드에 소환합니다.",
    "자신이 선택한 상대 선수 1장을 리타이어 시킵니다.",
    "등장: 자신의 양옆 빈 슬롯에 3 코스트 이상의 무작위 선수 카드를 각각 소환합니다. 이 카드가 필드에 있을때 생성된 카드들이 1 추가 데미지를 줍니다.",
    "등장:모든 적 선수의 공격력을 2 감소시킵니다. 이 카드가 필드에 있을때 공격력이 0이 된 적 선수는 기절당하고 침묵당합니다.",
    "등장:이 카드 비용을 지불하고 남은 Gold를 전부 소비합니다. 이때 소비한 1G마다 체력과 공격을 각각 +2씩 증가시킵니다",
    "등장:자신을 제외한 필드에 나와있는 아군 선수들에게 공격력 +2를 부여합니다.",
  ];
  for (const text of texts) {
    const analysis = analyzeEffectText(text, {
      cardCatalog: [{ id: "wiriyeo-id", name: "위리녀", cardType: "WRESTLER", isToken: false, isChampionToken: false }],
    });
    assert.equal(analysis.outcome, "supported", text);
    assert.equal(analysis.status, "success", text);
    assert.equal(isStructuredEffects({ effects: analysis.effects }), true, text);
  }
});

test("분석 실패였던 10개 WRESTLER 문구를 공용 Registry 효과로 분석한다", () => {
  const cases = [
    {
      text: "이 카드의 공격력이 증가하면, 같은 수치만큼 체력의 수치를 증가시킵니다.",
      trigger: "STAT_CHANGED",
      action: "BUFF",
    },
    {
      text: "출현:이 카드의 양 옆에 있는 카드들의 체력을 +1 증가시킵니다.",
      trigger: "ENTER_FIELD",
      action: "BUFF",
    },
    { text: "등장: 카드를 1장 뽑습니다.", trigger: "ENTER_FIELD", action: "DRAW" },
    {
      text: "등장:필드에 있는 아군 선수 하나를 선택하여 손으로 되돌립니다. 그 카드의 비용은 이번 턴에 1 감소합니다. (최소 1)",
      trigger: "ENTER_FIELD",
      action: "MOVE_TO_HAND",
    },
    {
      text: "등장:묘지에 있는 무작위 카드 한장의 공격력과 체력이랑 똑같은 수치의 '좀비'를 하나 소환하고 그 소환한 '좀비'에게 도발을 부여한다.",
      trigger: "ENTER_FIELD",
      action: "SUMMON",
    },
    { text: "러쉬, 회피", trigger: undefined, action: undefined },
    {
      text: "이 카드가 필드에 있는 동안 '솔져' 태그가 있는 카드들이 소환될때 +1/+1을 받습니다",
      trigger: "CARD_SUMMONED",
      action: "BUFF",
    },
    { text: "턴 종료:체력과 공격이 +1/+1 씩 증가한다", trigger: "TURN_END", action: "BUFF" },
    {
      text: "등장: 상대 손패에서 무작위 카드 1장을 내 손으로 훔쳐옵니다.",
      trigger: "ENTER_FIELD",
      action: "STEAL",
    },
    {
      text: "등장: 선택한 적 선수에게 1 피해를 줍니다. 그 효과로 대상의 체력이 정확히 1이 되면 자신에게 체력과 공격을 각각 2씩 부여합니다.",
      trigger: "ENTER_FIELD",
      action: "DAMAGE",
    },
  ];

  for (const item of cases) {
    const analysis = analyzeEffectText(item.text);
    assert.equal(analysis.status, "success", item.text);
    assert.equal(analysis.outcome, "supported", item.text);
    if (item.text !== "러쉬, 회피") {
      assert.equal(isStructuredEffects({ effects: analysis.effects }), true, item.text);
    }
    if (item.trigger) assert.equal(analysis.effects[0]?.trigger, item.trigger, item.text);
    if (item.action) assert.equal(analysis.effects[0]?.action, item.action, item.text);
  }
  const keywords = analyzeEffectText("러쉬, 회피");
  assert.deepEqual(keywords.keywords, ["RUSH", "DODGE"]);
});

test("remaining audit effects use generic target and modifier semantics", () => {
  const cases: Array<{ text: string; effects: Array<Record<string, any>> }> = [
    {
      text: "등장:내 덱과 손에 있는 6 비용 이상의 카드들의 비용을 전부 1 감소 시킵니다.",
      effects: [{ action: "REDUCE_COST", zones: ["HAND", "DECK"], minCost: 6 }],
    },
    {
      text: "등장:어디에 있든 '실험체' 태그가 붙은 카드들에게 체력을 1 부여합니다.",
      effects: [{ action: "BUFF", zones: ["HAND", "DECK", "BOARD"], health: 1 }],
    },
    {
      text: "등장:상대 필드에 비용이 1이하인 선수 카드가 있다면 그 카드들중 무작위 한장을 리타이어 시킵니다.(챔피언 토큰 제외)",
      effects: [{ action: "RETIRE", maxCost: 1, random: true }],
    },
    {
      text: "등장: 내 손에 무작위 선수 카드 1장을 생성합니다. 그 카드에게 -1/-1/-1을 적용합니다.",
      effects: [{ action: "GENERATE", destination: "HAND", generatedModifiers: { cost: -1, attack: -1, health: -1 } }],
    },
    {
      text: "적 선수를 공격하고 생존했다면 비용이 1 감소한채 손패로 돌아옵니다.",
      effects: [{ action: "REDUCE_COST" }, { action: "MOVE_TO_HAND" }],
    },
    {
      text: "등장: 상대 필드에 있는 선수 카드 한 장을 덱 맨 위로 보냅니다.",
      effects: [{ action: "MOVE_TO_DECK", zone: "BOARD", owner: "ENEMY", selection: "PLAYER_CHOICE", deckPosition: "TOP" }],
    },
  ];

  for (const item of cases) {
    const analysis = analyzeEffectText(item.text);
    assert.equal(analysis.status, "success", item.text);
    assert.equal(analysis.outcome, "supported", item.text);
    for (const expected of item.effects) {
      const actual = analysis.effects.find((effect) => effect.action === expected.action);
      assert.ok(actual, item.text);
      if (expected.zones) assert.deepEqual(actual?.target?.zones, expected.zones, item.text);
       if (expected.zone) assert.equal(actual?.target?.zone, expected.zone, item.text);
       if (expected.owner) assert.equal(actual?.target?.owner, expected.owner, item.text);
       if (expected.selection) assert.equal(actual?.target?.selection, expected.selection, item.text);
      if (expected.minCost !== undefined) assert.equal(actual?.target?.filter?.maxCost ?? actual?.target?.filter?.minCost, expected.minCost, item.text);
      if (expected.health !== undefined) assert.equal(actual?.values?.health, expected.health, item.text);
      if (expected.random) assert.equal(actual?.target?.selection, "RANDOM", item.text);
      if (expected.destination) assert.equal(actual?.values?.destination, expected.destination, item.text);
      if (expected.generatedModifiers) assert.deepEqual(actual?.values?.generatedModifiers, expected.generatedModifiers, item.text);
       if (expected.deckPosition) assert.equal(actual?.values?.deckPosition, expected.deckPosition, item.text);
    }
  }
});

test("card audit sources use generic start, entry, repeat, and scripted best-stat mechanics", () => {
  const river = analyzeEffectText("게임 시작:덱에 있었다면 손패에 드로우 됩니다.");
  assert.equal(river.status, "success");
  assert.equal(river.effects[0]?.trigger, "GAME_START");
  assert.equal(river.effects[0]?.action, "MOVE_TO_HAND");
  assert.deepEqual(river.effects[0]?.target, {
    zone: "DECK",
    owner: "SELF",
    selection: "SELF",
    count: 1,
  });

  const jaeger = analyzeEffectText("이 카드가 필드에 있는 동안 '솔져' 태그가 있는 카드들이 등장 혹은 소환 될때 +1/+1을 받습니다.");
  assert.equal(jaeger.status, "success");
  assert.equal(jaeger.effects[0]?.trigger, "CARD_ENTERED");
  assert.deepEqual(jaeger.effects[0]?.target?.filter?.tagsAny, ["솔져"]);

  const maros = analyzeEffectText("이 카드가 필드에 있을때 아군의 턴 종료 효과가 한번 더 발동합니다.");
  assert.equal(maros.status, "success");
  assert.equal(maros.effects[0]?.trigger, "TURN_END");
  assert.equal(maros.effects[0]?.action, "REPEAT_TURN_END");

  const smallHippo = analyzeEffectText("등장:상대의 필드에 있는 선수 카드 한장을 선택해서 상대방의 덱 맨위로 보냅니다.");
  assert.equal(smallHippo.status, "success");
  assert.equal(smallHippo.effects[0]?.action, "MOVE_TO_DECK");
  assert.equal(smallHippo.effects[0]?.target?.zone, "BOARD");
  assert.equal(smallHippo.effects[0]?.target?.owner, "ENEMY");
  assert.equal(smallHippo.effects[0]?.target?.selection, "PLAYER_CHOICE");
  assert.equal(smallHippo.effects[0]?.values?.deckPosition, "TOP");

  const zombieText = "등장:필드에 있는 '좀비' 중 가장 수치의 합이 높은 '좀비'의 체력과 공격력을 자신에게 더합니다. '좀비'가 없다면 2/2 '좀비'를 생성하고 그 '좀비'의 체력과 공격력을 자신에게 더합니다.";
  const zombieDefinition = { id: "zombie-id", name: "좀비", cardType: "WRESTLER" as const, isToken: true, isChampionToken: false };
  const zombie = analyzeEffectText(zombieText, { cardCatalog: [zombieDefinition] });
  assert.equal(zombie.status, "success");
  assert.equal(zombie.outcome, "supported");
  assert.equal(zombie.scripts?.length, 1);
  assert.equal(isEffectScriptConfig({ scripts: zombie.scripts }), true);
  const script = zombie.scripts?.[0];
  assert.equal(script?.trigger, "ENTER_FIELD");
  const selector = script?.steps[0];
  assert.ok(selector?.type === "SELECT");
  if (selector?.type === "SELECT") {
    assert.deepEqual(selector.target.filter?.definitionRef, { id: "zombie-id" });
  }
  const conditional = script?.steps.find((step) => step.type === "IF");
  assert.ok(conditional?.type === "IF");
  const generate = conditional?.type === "IF"
    ? conditional.else?.find((step) => step.type === "EFFECT" && step.effect.action === "GENERATE")
    : undefined;
  assert.ok(generate?.type === "EFFECT");
  if (generate?.type === "EFFECT") {
    assert.equal(generate.effect.values?.destination, "HAND");
    assert.deepEqual(generate.effect.values?.definitionRef, { id: "zombie-id" });
  }
  const setGeneratedStats = conditional?.type === "IF"
    ? conditional.else?.find((step) => step.type === "EFFECT" && step.effect.action === "SET_STATS")
    : undefined;
  assert.ok(setGeneratedStats?.type === "EFFECT");
  if (setGeneratedStats?.type === "EFFECT") {
    assert.deepEqual(setGeneratedStats.effect.values, { attack: 2, health: 2 });
  }

  const missingCatalog = analyzeEffectText(zombieText);
  assert.equal(missingCatalog.outcome, "analysis_failure");
  assert.equal(missingCatalog.effects.length, 0);
  const ambiguousCatalog = analyzeEffectText(zombieText, {
    cardCatalog: [
      zombieDefinition,
      { ...zombieDefinition, id: "second-zombie-id" },
    ],
  });
  assert.equal(ambiguousCatalog.outcome, "analysis_failure");
  assert.equal(ambiguousCatalog.referenceErrors?.[0]?.code, "CARD_REFERENCE_AMBIGUOUS");
});

test("card audit gaps analyze Ttekkaluk's stat transfer and Pi Star Seven's source-excluding buff", () => {
  const tekkaluk = analyzeEffectText(
    "등장:상대 선수 카드 1장을 선택해서 그 카드의 공격력을 1로 줄이고 기절을 걸고, 공격력을 줄인 만큼 자신의 체력을 증가시킵니다.",
  );
  assert.equal(tekkaluk.status, "success");
  assert.equal(tekkaluk.outcome, "supported");
  assert.deepEqual(tekkaluk.effects, []);
  assert.equal(tekkaluk.scripts?.length, 1);
  assert.equal(isEffectScriptConfig({ scripts: tekkaluk.scripts }), true);
  const script = tekkaluk.scripts?.[0];
  assert.equal(script?.trigger, "ENTER_FIELD");
  const selection = script?.steps[0];
  assert.ok(selection?.type === "SELECT");
  if (selection?.type === "SELECT") {
    assert.deepEqual(selection.target, {
      zone: "BOARD",
      owner: "ENEMY",
      cardType: "WRESTLER",
      selection: "PLAYER_CHOICE",
      count: 1,
    });
  }
  const branch = script?.steps.find((step) => step.type === "IF");
  assert.ok(branch?.type === "IF");
  if (branch?.type === "IF") {
    const setAttack = branch.then.find((step) => step.type === "EFFECT" && step.effect.action === "SET_STAT");
    assert.ok(setAttack?.type === "EFFECT");
    if (setAttack?.type === "EFFECT") {
      assert.deepEqual(setAttack.effect.values, { stat: "ATTACK", amount: 1 });
    }
    const transfer = branch.then.find((step) => step.type === "EFFECT" && step.effect.action === "BUFF");
    assert.ok(transfer?.type === "EFFECT");
    if (transfer?.type === "EFFECT") {
      assert.deepEqual(transfer.effect.values?.healthExpression, {
        kind: "RESULT_VALUE",
        resultId: "attackBefore",
        offset: -1,
      });
    }
  }
  const stun = script?.steps.find((step) => step.type === "EFFECT" && step.effect.action === "STUN");
  assert.ok(stun?.type === "EFFECT");

  const malformed = structuredClone(script!);
  const malformedBranch = malformed.steps.find((step) => step.type === "IF");
  if (malformedBranch?.type === "IF") {
    const buff = malformedBranch.then.find((step) => step.type === "EFFECT" && step.effect.action === "BUFF");
    if (buff?.type === "EFFECT") {
      const expression = buff.effect.values?.healthExpression as Record<string, unknown> | undefined;
      if (expression) expression.offset = "not-a-number";
    }
  }
  assert.equal(isEffectScriptConfig({ scripts: [malformed] }), false);

  const piStar = analyzeEffectText("등장:자신을 제외한 필드에 나와있는 아군 선수들에게 +2/+2를 부여합니다.");
  assert.equal(piStar.status, "success");
  assert.equal(piStar.outcome, "supported");
  assert.equal(piStar.effects[0]?.action, "BUFF");
  assert.deepEqual(piStar.effects[0]?.values, { attack: 2, health: 2 });
  assert.deepEqual(piStar.effects[0]?.target, {
    zone: "BOARD",
    owner: "SELF",
    cardType: "WRESTLER",
    filter: { excludeSource: true },
    selection: "ALL",
    count: 20,
  });
});