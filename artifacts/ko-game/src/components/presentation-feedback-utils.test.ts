import assert from "node:assert/strict";
import test from "node:test";

import { presentationCueDrafts, presentationEventKey } from "./presentation-feedback-utils";

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

test("동일한 퀘스트 완료 이벤트를 재동기화해도 occurrence key가 유지된다", () => {
  const event = {
    type: "CHAMPION_QUEST_COMPLETED" as const,
    championId: "champion",
    target: { type: "CHAMPION" as const, championId: "champion" },
  };
  const snapshot = [event, { ...event }];
  const firstKeys = snapshot.map((item, index) => presentationEventKey(item, index, snapshot));
  const resyncedKeys = snapshot.map((item, index) => presentationEventKey(item, index, snapshot));

  assert.notEqual(firstKeys[0], firstKeys[1]);
  assert.deepEqual(resyncedKeys, firstKeys);
});

test("새 이벤트 배치가 이전 큐 항목과 같은 모양이어도 stable key가 충돌하지 않는다", () => {
  const event = { type: "DAMAGE_DEALT" as const, cardInstanceId: "target", amount: 1 };
  const first = presentationCueDrafts([event], 0, ["match:17"]);
  const second = presentationCueDrafts([event], 0, ["match:18"]);

  assert.notEqual(first[0]?.id, second[0]?.id);
});

test("온라인 viewer의 턴 시작은 YOUR TURN으로 표시한다", () => {
  const cues = presentationCueDrafts([
    { type: "TURN_STARTED" as const, playerId: "PLAYER_TWO" },
    { type: "TURN_STARTED" as const, playerId: "PLAYER_ONE" },
  ], 0, undefined, "PLAYER_TWO");

  assert.deepEqual(cues.map((cue) => cue.label), ["YOUR TURN", "TURN START"]);
});