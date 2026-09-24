import assert from "node:assert/strict";
import test from "node:test";
import {
  detectEffectSemanticAmbiguities,
  normalizeEffectLanguage,
} from "./effect-language";

test("normalizes bounded Korean spelling, shorthand, and spacing noise", () => {
  assert.equal(
    normalizeEffectLanguage("등장상대선수하나2뎀").normalizedText,
    "등장 상대 선수 하나 2 피해",
  );
  assert.equal(
    normalizeEffectLanguage("등장상대중피젤낮은놈2뎀").normalizedText,
    "등장 상대 중 체력이 가장 낮은 선수 2 피해",
  );
  assert.equal(
    normalizeEffectLanguage("손이랑덱6코이상전부1싸게").normalizedText,
    "손패와 덱 6 비용 이상 전부 비용 -1",
  );
  assert.equal(
    normalizeEffectLanguage("나빼고내필드애들공체2씩").normalizedText,
    "자신을 제외하고 아군 선수 공격력 +2 체력 +2",
  );
  assert.equal(
    normalizeEffectLanguage("공격하고안죽었으면코1깎고손으로").normalizedText,
    "ATTACK_SURVIVED: 비용 -1 손으로",
  );
  assert.equal(
    normalizeEffectLanguage("등장적랜덤한놈하나퇴장챔토큰빼").normalizedText,
    "등장 적 무작위 선수 하나 퇴장 챔피언 토큰 제외",
  );
});

test("normalization is idempotent and reports only applied normalization rules", () => {
  const first = normalizeEffectLanguage("  등장:  무작이 선수에게  2뎀！ ");
  const second = normalizeEffectLanguage(first.normalizedText);
  assert.equal(second.normalizedText, first.normalizedText);
  assert.ok(first.corrections.includes("TYPO_MUJAKI"));
  assert.ok(first.corrections.includes("ABBREVIATION_DAMAGE"));
});

test("100 deterministic whitespace-fuzz inputs keep their canonical normalized meaning", () => {
  const canonicalInputs = [
    "등장 상대 선수 하나 2 피해",
    "등장 상대 중 체력이 가장 낮은 선수 2 피해",
    "손패와 덱 6 비용 이상 전부 비용 -1",
    "자신을 제외하고 아군 선수 공격력 +2 체력 +2",
    "ATTACK_SURVIVED: 비용 -1 손으로",
    "등장 적 무작위 선수 하나 퇴장 챔피언 토큰 제외",
    "턴 종료 내 공격력 가장 낮은 선수 공격력 +1",
    "적 선수 하나 선택 2 피해 주고 그 선수 기절",
    "내 좀비가 죽으면 언데드들 체력 +2",
    "다음 상대 선수가 등장할 때 공격력 +2",
  ];
  const separators = [" ", "  ", "\t", "\n", " \t ", "\n  ", "\u00a0", "   ", "\t ", " \n"];
  let cases = 0;

  canonicalInputs.forEach((canonical, intentIndex) => {
    const expected = normalizeEffectLanguage(canonical).normalizedText;
    for (let variantIndex = 0; variantIndex < 10; variantIndex += 1) {
      let boundary = 0;
      const variant = canonical.replace(/ /gu, () => {
        const separator = separators[(variantIndex + boundary + intentIndex) % separators.length]!;
        boundary += 1;
        return separator;
      });
      assert.equal(
        normalizeEffectLanguage(variant).normalizedText,
        expected,
        `intent ${intentIndex + 1}, whitespace variant ${variantIndex + 1}`,
      );
      cases += 1;
    }
  });

  assert.equal(cases, 100);
});

test("ambiguous effect language is flagged for clarification rather than guessed", () => {
  const ambiguousInputs = [
    "상대 하나 처리",
    "적 선수 하나 처리해",
    "카드 하나 없애",
    "상대 선수 하나 제거",
    "피 올려",
    "체력 좀 높여",
    "공격력 강화",
    "피해를 줘",
    "걔 좀 세게",
    "그 카드 약하게",
    "한놈 가져와",
    "2 올려",
    "손으로 보내",
    "등장하면 강해짐",
    "퇴장하면 적당히 버프",
    "상대 선수 하나",
    "좀비 하나 줘",
    "카드를 어디론가 보내",
    "그 카드에게 뭔가 해",
    "적당히 처리해",
  ];

  for (const input of ambiguousInputs) {
    assert.ok(
      detectEffectSemanticAmbiguities(input).length > 0,
      `expected clarification for: ${input}`,
    );
  }
});