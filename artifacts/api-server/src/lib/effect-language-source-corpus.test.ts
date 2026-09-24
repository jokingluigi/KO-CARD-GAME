import assert from "node:assert/strict";
import test from "node:test";
import { analyzeEffectText, type CardReferenceCandidate } from "./structured-effects";
import { detectEffectSemanticAmbiguities, normalizeEffectLanguage } from "./effect-language";

const currentSources = [
  ["챔피언 판도라(폭주)", "등장:선택한 선수를 파괴시킵니다. \n이 카드가 필드에 있을때 이 카드가 리타이어 혹은 파괴 시킨 선수의 공격력을 이 카드의 공격력에 더합니다."],
  ["예거", "이 카드가 필드에 있는 동안 '솔져' 태그가 있는 카드들이 등장 혹은 소환 될때 +1/+1을 받습니다."],
  ["발단 · 좀비 소환", "등장:묘지에 있는 비용이 3 이하인 무작위 카드 한장의 공격력과 체력이랑 똑같은 수치의 '좀비'를 하나 소환합니다."],
  ["라 칼라베라", "등장: 내 묘지에서 비용이 3 이하인 선수 카드들 중 하나를 무작위로 선정해서 부활시킵니다.그 카드에게 도발을 부여합니다."],
  ["흑구슬마스터", "등장:선택한 적 선수 하나를 파괴합니다."],
  ["피 스타 세븐", "등장:자신을 제외한 필드에 나와있는 아군 선수들에게 +2/+2를 부여합니다."],
  ["아비터", "등장:어디에 있든 '기계' 태그가 달려있는 모든 아군 카드들에게 체력을 +1을 부여합니다."],
  ["떼껄룩", "등장:상대 선수 카드 1장을 선택해서 그 카드의 공격력을 1로 줄이고 기절을 걸고, 공격력을 줄인 만큼 자신의 체력을 증가시킵니다."],
  ["발단 · 자기 소환", "등장:'발단'을 소환합니다."],
  ["리버덩크", "게임 시작:덱에 있었다면 손패에 드로우 됩니다."],
  ["워썬더", "등장: 내 손에 무작위 선수 카드 1장을 생성합니다. 그 카드에게 -1/-1/-1을 적용합니다."],
  ["아포스틸", "등장:어디에 있든 '실험체' 태그가 달려있는 모든 아군 카드들에게 체력을 +1을 부여합니다"],
  ["매드 사이언티스트 퍼플레인", "등장:어디에 있든 '실험체' 태그가 달려있는 모든 아군 카드들에게 +1/+1을 부여합니다"],
  ["도금구슬 마스터", "등장:내 덱과 손에 있는 6 비용 이상의 카드들의 비용을 전부 1 감소 시킵니다."],
  ["작은 하마", "등장:상대의 필드에 있는 선수 카드 한장을 선택해서 상대방의 덱 맨위로 보냅니다."],
  ["뒷정리맨", "출현:다음에 출현하는 카드에게 체력을 +2 부여합니다."],
  ["도쿵", "이 카드의 공격력이 증가하면, 같은 수치만큼 체력의 수치를 증가시킵니다."],
  ["데헌", "이 카드의 공격력이 처음 증가할 때, 회피 1회를 얻습니다."],
  ["프랑켄슈타인 만드릴쿤", "이 카드의 체력이 증가하면 추가로 +1 증가합니다"],
  ["만드릴쿤", "이 카드의 공격력이 증가할때마다, 공격력을 추가로 1 얻습니다."],
  ["챔피언 피 스타 세븐 · ability", "손패에 있는 선수 카드 중 무작위 한장의 체력과 공격을 1씩 증가시킨다."],
  ["챔피언 예거 · ability", "'용병'을 하나 소환한다."],
  ["챔피언 예거 · quest reward", "고유 능력을 강화시킨다."],
  ["챔피언 예거 · upgraded ability", "'엘리트 용병'을 하나 소환한다."],
  ["챔피언 여울 · ability", "다음 턴에 골드를 추가로 1 더 받습니다."],
  ["챔피언 판도라 · ability", "자신이 선택한 선수에게 1 데미지를 줍니다."],
  ["챔피언 판도라 · quest reward", "고유 능력을 강화시키고, '챔피언 판도라(폭주)'를 필드에 소환합니다."],
  ["챔피언 판도라 · upgraded ability", "자신이 선택한 대상에게 2 데미지를 줍니다."],
] as const;

const sourceCardCatalog: CardReferenceCandidate[] = currentSources
  .filter(([name]) => !name.startsWith("챔피언 "))
  .map(([name], index) => ({
    id: `source-fixture-${index}`,
    name,
    cardType: "WRESTLER" as const,
    isToken: false,
    isChampionToken: false,
  }));
const availableTags = ["솔져", "좀비", "기계", "실험체", "언데드", "용병", "엘리트 용병"];

function threeNoisyVariants(text: string): string[] {
  const spaced = text.replace(/\s/gu, "\u00a0") + "！";
  const slang = text
    .replace(/무작위/gu, "랜덤")
    .replace(/(\d+)\s*(?:피해|데미지)/gu, "$1뎀")
    .replace(/리타이어/gu, "리타어");
  const typoAndNoise = `\u200B${slang === text ? text : slang} ！！`;
  const punctuation = `？ ${text.replace(/\s+/gu, " \t \u00a0 ")} !`;
  return [spaced, typoAndNoise, punctuation];
}

function analysisClass(text: string) {
  const ambiguities = detectEffectSemanticAmbiguities(text);
  if (ambiguities.length > 0) return "AMBIGUOUS_SOURCE";
  const analysis = analyzeEffectText(text, { cardCatalog: sourceCardCatalog, availableTags });
  if (analysis.outcome === "supported" && analysis.effects.length > 0) return "SUPPORTED";
  if (analysis.status === "failure") return "ANALYSIS_FAILED";
  return "UNSUPPORTED_SOURCE";
}

function semanticSignature(text: string) {
  const analysis = analyzeEffectText(text, { cardCatalog: sourceCardCatalog, availableTags });
  return {
    outcome: analysis.outcome,
    status: analysis.status,
    effects: analysis.effects,
    scripts: analysis.scripts ?? [],
    keywords: analysis.keywords,
    unsupportedSegments: analysis.unsupportedSegments,
  };
}

test("current card and Champion source text corpus has three noise variants per source", () => {
  assert.equal(currentSources.length, 28);
  for (const [label, text] of currentSources) {
    const baseline = normalizeEffectLanguage(text).normalizedText;
    const baselineClass = analysisClass(text);
    const variants = threeNoisyVariants(text);
    assert.equal(variants.length, 3, `${label} has three variants`);

    for (const [index, variant] of variants.entries()) {
      assert.notEqual(variant, text, `${label} variant ${index + 1} adds language noise`);
      assert.equal(
        normalizeEffectLanguage(variant).normalizedText,
        baseline,
        `${label} variant ${index + 1} preserves its normalized meaning`,
      );
      assert.equal(
        analysisClass(variant),
        baselineClass,
        `${label} variant ${index + 1} keeps the source classification`,
      );
      if (baselineClass === "SUPPORTED") {
        assert.deepEqual(
          semanticSignature(variant),
          semanticSignature(text),
          `${label} variant ${index + 1} has the same validated analyzer semantics`,
        );
      }
    }
  }
});

test("100 deterministic noisy inputs preserve semantics across ten effect categories", () => {
  const categoryNames = new Set([
    "챔피언 판도라(폭주)",
    "예거",
    "발단 · 좀비 소환",
    "라 칼라베라",
    "흑구슬마스터",
    "피 스타 세븐",
    "발단 · 자기 소환",
    "리버덩크",
    "도금구슬 마스터",
    "작은 하마",
  ]);
  const sources = currentSources.filter(([name]) => categoryNames.has(name));
  assert.equal(sources.length, 10);

  const whitespace = [" ", "\t", "\u00a0", "\n", "\u3000", " \t ", "\u00a0 "];
  const punctuation = ["！", "!!", "？", "。", "...", " \t !", "\n！！"];
  let cases = 0;
  for (const [label, text] of sources) {
    const baseline = normalizeEffectLanguage(text).normalizedText;
    const baselineClass = analysisClass(text);
    const baselineSignature = semanticSignature(text);
    for (let index = 0; index < 10; index += 1) {
      const variant = `\u200B${text
        .replace(/\s+/gu, () => whitespace[index % whitespace.length]!)
        .replace(/:/gu, index % 2 === 0 ? "：" : ":")}${punctuation[index % punctuation.length]}`;
      assert.notEqual(variant, text, `${label} fuzz case ${index + 1} changes surface noise`);
      assert.equal(
        normalizeEffectLanguage(variant).normalizedText,
        baseline,
        `${label} fuzz case ${index + 1} preserves normalized text`,
      );
      assert.equal(analysisClass(variant), baselineClass, `${label} fuzz case ${index + 1} keeps classification`);
      if (baselineClass === "SUPPORTED") {
        assert.deepEqual(
          semanticSignature(variant),
          baselineSignature,
          `${label} fuzz case ${index + 1} preserves its validated effect AST`,
        );
      }
      cases += 1;
    }
  }
  assert.equal(cases, 100);
});