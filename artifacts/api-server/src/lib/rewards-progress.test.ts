import assert from "node:assert/strict";
import test from "node:test";
import { isDailyQuestClaimable, objectiveIncrement, selectDailyQuestDefinitions } from "./daily-quest-service";
import { nextAttendanceDayIndex } from "./attendance-service";
import { isFinishedMatchRewardEligible, rewardIdempotencyKey } from "./reward-service";

test("MR1/MR2: only a canonical finished match with a winner is reward eligible", () => {
  assert.equal(isFinishedMatchRewardEligible("FINISHED", "winner-1", "GAME_FINISHED"), true);
  assert.equal(isFinishedMatchRewardEligible("FINISHED", "winner-1", "DISCONNECT_TIMEOUT"), true);
  assert.equal(isFinishedMatchRewardEligible("ACTIVE", "winner-1", null), false);
  assert.equal(isFinishedMatchRewardEligible("FINISHED", null, "GAME_FINISHED"), false);
  assert.equal(isFinishedMatchRewardEligible("FINISHED", "winner-1", "ABORTED"), false);
});

test("MR3/MR4: match reward identity stays fixed across retries and reconnects", () => {
  const input = { sourceType: "MATCH_ONLINE_WIN", sourceId: "match-1", userId: "user-1", rewardType: "CURRENCY" };
  assert.equal(rewardIdempotencyKey(input), rewardIdempotencyKey(input));
  assert.notEqual(rewardIdempotencyKey(input), rewardIdempotencyKey({ ...input, userId: "user-2" }));
});

test("DQ1/DQ2/DQ3: daily assignment selects three distinct definitions and stays stable for the same user/day", () => {
  const definitions = Array.from({ length: 10 }, (_, index) => `quest-${index}`);
  const first = selectDailyQuestDefinitions(definitions, "user-1", "2026-09-23");
  const second = selectDailyQuestDefinitions(definitions, "user-1", "2026-09-23");
  const nextDay = selectDailyQuestDefinitions(definitions, "user-1", "2026-09-24");
  assert.equal(first.length, 3);
  assert.equal(new Set(first).size, 3);
  assert.deepEqual(second, first);
  assert.notDeepEqual(nextDay, first);
});

test("DQ4: daily assignment returns the available pool when fewer than three definitions exist", () => {
  const selected = selectDailyQuestDefinitions(["quest-1", "quest-2"], "user-1", "2026-09-23");
  assert.deepEqual(new Set(selected), new Set(["quest-1", "quest-2"]));
});

test("DQ5: daily quest progress counts a canonical event once and filters card type", () => {
  const event = { type: "CARD_PLAYED" as const, playerId: "PLAYER_ONE", cardType: "TECHNIQUE" as const };
  assert.equal(objectiveIncrement("CARD_PLAYED", event, "PLAYER_ONE", "TECHNIQUE"), 1);
  assert.equal(objectiveIncrement("CARD_PLAYED", event, "PLAYER_ONE", "WRESTLER"), 0);
  assert.equal(objectiveIncrement("TECHNIQUE_PLAYED", event, "PLAYER_ONE", null), 1);
  assert.equal(objectiveIncrement("CARD_PLAYED", event, "PLAYER_TWO", null), 0);
});

test("DQ6/DQ7: completion is separate from claim and only completed quests are claimable", () => {
  assert.equal(isDailyQuestClaimable("IN_PROGRESS", 3, 3), false);
  assert.equal(isDailyQuestClaimable("COMPLETED", 3, 3), true);
  assert.equal(isDailyQuestClaimable("COMPLETED", 4, 3), true);
  assert.equal(isDailyQuestClaimable("CLAIMED", 3, 3), false);
});

test("AT1/AT2/AT3/AT4: attendance advances from the highest claimed day without inventing a streak reset", () => {
  assert.equal(nextAttendanceDayIndex([]), 1);
  assert.equal(nextAttendanceDayIndex([1]), 2);
  assert.equal(nextAttendanceDayIndex([1, 3]), 4);
});