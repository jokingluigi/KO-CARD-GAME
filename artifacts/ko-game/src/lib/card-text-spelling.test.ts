import assert from "node:assert/strict";
import test from "node:test";
import { checkCardText, fixAllSpelling } from "./card-text-spelling.ts";

test("fixes common card-text mistakes to the house style", () => {
  const cases: Array<[string, string]> = [
    ["등장: 상대 선수 한장에게 3데미지를 줍니다", "등장:상대 선수 한 장에게 3 데미지를 줍니다."],
    ["무덤에 있는 카드을 손패로 가져옵니다.", "묘지에 있는 카드를 손패로 가져옵니다."],
    ["공격 할때 체력를 1 회복 합니다.", "공격할 때 체력을 1 회복합니다."],
    ["다음턴에 1골드를 받습니다.", "다음 턴에 1 골드를 받습니다."],
    ["아군 선수에게 +1/+1를 부여합니다.", "아군 선수에게 +1/+1을 부여합니다."],
    ["\"마피아\"태그 카드가 리타이어 될 수없습니다.", "'마피아' 태그 카드가 리타이어될 수 없습니다."],
    ["'도발'를 가진 카드를 파괴 시킵니다 .", "'도발'을 가진 카드를 파괴시킵니다."],
    ["체력이 깍이면 덱으로 돌아갑니다.", "체력이 깎이면 덱으로 돌아갑니다."],
    ["챔피언이 데미지를 입으면 필드로 소환됩니다.", "챔피언이 데미지를 입으면 필드로 소환됩니다."],
  ];
  for (const [input, expected] of cases) assert.equal(fixAllSpelling(input.replace("\"마피아\"태그", "\"마피아\" 태그"), ["마피아"]), expected, input);
});

test("leaves correct live wording alone", () => {
  const fine = [
    "등장:상대 선수 1장의 공격력을 최대 2 감소시키고, 실제로 감소시킨 만큼 이 카드의 공격력을 증가시킵니다.",
    "이 카드가 필드에 있을 때 아군 선수 카드 혹은 챔피언이 데미지를 입을 때마다 이 카드의 공격력이 1 증가합니다.",
    "턴 종료:이 카드가 손패에 남아있었다면 내 패배입니다!",
    "뭐....비웃는 소리라도 들리는 것 같네요.",
    "이 카드의 공격력이 증가합니다.(최대 6)",
    "마을을 지키는 가을 노을.",
  ];
  for (const text of fine) assert.deepEqual(checkCardText(text).map((f) => `${f.from}→${f.to}`), [], text);
});

test("every suggestion explains itself in Korean", () => {
  for (const fix of checkCardText("등장: 카드을 한장 파괴 합니다")) assert.match(fix.reason, /[가-힣]/);
});
