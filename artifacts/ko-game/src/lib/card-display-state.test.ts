import { test } from "node:test";
import assert from "node:assert/strict";
import { getVisibleCardRulesText, KEYWORD_RULE_LABELS } from "./card-display-state";

test("공격불가·합체 키워드는 한국어 이름을 가진다 (내부 코드 노출 방지)", () => {
  assert.equal(KEYWORD_RULE_LABELS.CANNOT_ATTACK, "공격불가");
  assert.equal(KEYWORD_RULE_LABELS.FUSION, "합체");
});

test("키워드만 있는 카드는 '효과 없음' 대신 키워드 이름을 본문에 보여 준다", () => {
  assert.equal(getVisibleCardRulesText("", ["CANNOT_ATTACK"]), "공격불가");
  assert.equal(getVisibleCardRulesText("", ["TAUNT", "CANNOT_ATTACK"]), "도발, 공격불가");
});

test("본문에 이미 적힌 키워드는 띄어쓰기가 달라도 두 번 붙이지 않는다", () => {
  const withQuote = "카운트다운(1):이 카드의 '공격불가'를 제거한다.";
  assert.equal(getVisibleCardRulesText(withQuote, ["COUNTDOWN", "CANNOT_ATTACK"]), withQuote);
  assert.equal(getVisibleCardRulesText("공격 불가", ["CANNOT_ATTACK"]), "공격 불가");
  assert.equal(getVisibleCardRulesText("이 카드는 공격 불가 상태로 등장한다.", ["CANNOT_ATTACK"]), "이 카드는 공격 불가 상태로 등장한다.");
});

test("키워드도 본문도 없는 카드는 빈 문자열(화면에서 '효과 없음')", () => {
  assert.equal(getVisibleCardRulesText("", []), "");
});
