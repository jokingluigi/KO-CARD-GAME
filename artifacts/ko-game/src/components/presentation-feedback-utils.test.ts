import assert from "node:assert/strict";
import test from "node:test";

import { presentationCueDrafts } from "./presentation-feedback-utils";

test("이벤트 순서대로 피해, 퇴장, 퀘스트 완료 피드백을 만든다", () => {
  const cues = presentationCueDrafts([
    {
      type: "DAMAGE_DEALT",
      target: { type: "CARD", cardInstanceId: "target" },
      amount: 4,
    },
    {
      type: "CARD_RETIRED",
      cardInstanceId: "target",
      target: { type: "CARD", cardInstanceId: "target" },
      reason: "RETIRE",
    },
    {
      type: "CHAMPION_QUEST_COMPLETED",
      championId: "champion",
      target: { type: "CHAMPION", championId: "champion" },
    },
  ], 0);

  assert.deepEqual(
    cues.map((cue) => [cue.kind, cue.label]),
    [
      ["DAMAGE", "-4"],
      ["RETIRE", "RETIRE"],
      ["QUEST_COMPLETE", "QUEST COMPLETE"],
    ],
  );
});

test("0 피해는 피해 숫자 대신 회피 피드백을 사용하고 알 수 없는 이벤트는 무시한다", () => {
  const cues = presentationCueDrafts([
    { type: "DAMAGE_DEALT", amount: 0, reason: "DODGE" },
    { type: "ATTACK_DECLARED", cardInstanceId: "attacker" },
  ], 0);

  assert.equal(cues.length, 1);
  assert.equal(cues[0]?.kind, "DODGE");
  assert.equal(cues[0]?.label, "DODGE");
});

test("이벤트 로그 커서 이후의 항목만 큐에 추가한다", () => {
  const cues = presentationCueDrafts([
    { type: "CARD_DRAWN", cardInstanceId: "old" },
    { type: "CARD_DRAWN", cardInstanceId: "new" },
  ], 1);

  assert.equal(cues.length, 1);
  assert.equal(cues[0]?.cardInstanceId, "new");
});