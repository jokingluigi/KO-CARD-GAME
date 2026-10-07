import { test } from "node:test";
import assert from "node:assert/strict";
import {
  objectiveIncrement,
  validateDailyQuestInput,
} from "./daily-quest-service";
test("damage daily quest counts real positive damage amount, not occurrences", () => {
  for (const amount of [1, 3, 6, 12])
    assert.equal(
      objectiveIncrement(
        "DAMAGE_DEALT",
        { type: "DAMAGE_DEALT", playerId: "me", amount },
        "me",
        null,
      ),
      amount,
    );
  for (const amount of [0, -1, NaN, Infinity])
    assert.equal(
      objectiveIncrement(
        "DAMAGE_DEALT",
        { type: "DAMAGE_DEALT", playerId: "me", amount },
        "me",
        null,
      ),
      0,
    );
  assert.equal(
    objectiveIncrement(
      "DAMAGE_DEALT",
      { type: "DAMAGE_DEALT", playerId: "other", amount: 9 },
      "me",
      null,
    ),
    0,
  );
});
test("malformed non-null conditions cannot silently become legacy quests", () => {
  const base = {
    title: "Daily",
    description: "",
    objectiveType: "CARD_PLAYED",
    targetValue: 3,
    rewardAmount: 100,
  };
  assert.ok(
    validateDailyQuestInput({
      ...base,
      condition: null,
      schemaVersion: "QUEST_CONDITION_V1",
    }),
  );
  for (const condition of [{ event: "UNKNOWN" }, false, {}, "bad"])
    assert.equal(validateDailyQuestInput({ ...base, condition }), null);
});
