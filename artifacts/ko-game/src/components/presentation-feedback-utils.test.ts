import assert from "node:assert/strict";
import test from "node:test";

import { presentationCueDrafts, presentationEventKey, presentationBlocksActions, visibleStatFeedback } from "./presentation-feedback-utils";

test('whole-deck stat feedback does not block actions or present hidden-card flashes', () => {
  const events = Array.from({ length: 25 }, (_, index) => ({
    type: 'STAT_CHANGED' as const, stat: 'attack' as const, delta: 1,
    target: { type: 'CARD' as const, cardInstanceId: `copy-${index}` },
  }));
  const cues = presentationCueDrafts(events, 0);
  assert.equal(cues.length, 25);
  assert.equal(presentationBlocksActions(cues), false);
  assert.deepEqual(cues.filter(cue => visibleStatFeedback(cue, new Set(['copy-0']))).map(cue => cue.cardInstanceId), ['copy-0']);
  assert.equal(presentationBlocksActions(presentationCueDrafts([{ type: 'CHAMPION_QUEST_COMPLETED' }], 0)), true);
  assert.equal(presentationBlocksActions(presentationCueDrafts([{ type: 'CARD_TRANSFORMED' }], 0)), true);
});

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

test("챔피언 퀘스트 완료 연출에 실제 플레이어 ID를 전달한다", () => {
  const cues = presentationCueDrafts([{
    type: "CHAMPION_QUEST_COMPLETED", playerId: "player-1", championId: "champion-1",
    target: { type: "CHAMPION", championId: "champion-1" },
  }], 0);
  assert.equal(cues[0]?.playerId, "player-1");
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

test("피해 차단과 실제 회피를 다른 피드백으로 표시한다", () => {
  const cues = presentationCueDrafts([
    { type: "DAMAGE_DEALT", amount: 0, tags: ["BLOCKED"] },
    { type: "DAMAGE_DEALT", amount: 0, tags: ["DODGE"] },
  ], 0);
  assert.deepEqual(cues.map((cue) => cue.kind), ["BLOCK", "DODGE"]);
});

test("흡수 스탯과 변신 효과는 출발 카드 및 목표 카드를 함께 기록한다", () => {
  const cues = presentationCueDrafts([
    { type: 'STAT_CHANGED', stat: 'attack', delta: 3, source: { type: 'CARD', cardInstanceId: 'victim' }, target: { type: 'CARD', cardInstanceId: 'absorber' } },
    { type: 'STAT_CHANGED', stat: 'health', delta: 2, source: { type: 'CARD', cardInstanceId: 'victim' }, target: { type: 'CARD', cardInstanceId: 'absorber' } },
    { type: 'CARD_TRANSFORMED', source: { type: 'CARD', cardInstanceId: 'source' }, target: { type: 'CARD', cardInstanceId: 'original' } },
  ], 0);
  assert.deepEqual(cues.map((cue) => [cue.kind, cue.label, cue.sourceCardInstanceId, cue.cardInstanceId]), [
    ['BUFF', '공격력 +3', 'victim', 'absorber'],
    ['HEAL', '체력 +2', 'victim', 'absorber'],
    ['TRANSFORM', '변신', 'source', 'original'],
  ]);
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

test("긴 이벤트 로그도 중복 payload를 고유 key로 선형 처리한다", () => {
  const events = Array.from({ length: 1_000 }, (_, index) => ({
    type: "DAMAGE_DEALT" as const,
    cardInstanceId: "same-target",
    amount: index % 5,
  }));
  const before = performance.now();
  const keys = events.map((event, index) => presentationEventKey(event, index, events));
  const optimizedMs = performance.now() - before;
  const oldBefore = performance.now();
  const oldKeys = events.map((event, index) => {
    const fingerprint = JSON.stringify(event);
    const occurrence = events
      .slice(0, index)
      .filter((candidate) => JSON.stringify(candidate) === fingerprint)
      .length;
    return `${fingerprint}:${occurrence}`;
  });
  const quadraticBaselineMs = performance.now() - oldBefore;
  console.log(`presentation key benchmark: optimized=${optimizedMs.toFixed(2)}ms baseline=${quadraticBaselineMs.toFixed(2)}ms`);
  assert.equal(new Set(keys).size, events.length);
  assert.equal(new Set(oldKeys).size, events.length);
  assert.deepEqual(presentationEventKey(events[0]!, 0, events), presentationEventKey(events[0]!, 0, events));
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
