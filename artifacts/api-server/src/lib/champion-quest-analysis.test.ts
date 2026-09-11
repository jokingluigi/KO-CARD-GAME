import assert from "node:assert/strict";
import test from "node:test";

import { analyzeChampionQuestText } from "./champion-quest-analysis";

test("일반적인 선수 카드 생성 퀘스트를 분석한다", () => {
  assert.deepEqual(
    analyzeChampionQuestText("카드를 3장 생성합니다."),
    {
      outcome: "supported",
      condition: { event: "CARD_GENERATED", cardType: "WRESTLER", progress: 1, required: 3 },
    },
  );
  assert.deepEqual(
    analyzeChampionQuestText("선수 카드 3장을 생성합니다."),
    {
      outcome: "supported",
      condition: { event: "CARD_GENERATED", cardType: "WRESTLER", progress: 1, required: 3 },
    },
  );
});

test("선수 리타이어와 챔피언 능력 사용 퀘스트를 분석한다", () => {
  assert.deepEqual(
    analyzeChampionQuestText("선수 카드를 2회 리타이어시킵니다."),
    {
      outcome: "supported",
      condition: { event: "WRESTLER_RETIRED", cardType: "WRESTLER", required: 2 },
    },
  );
  assert.deepEqual(
    analyzeChampionQuestText("챔피언 능력을 4번 사용합니다."),
    {
      outcome: "supported",
      condition: { event: "CHAMPION_ABILITY_USED", progress: 1, required: 4 },
    },
  );
});