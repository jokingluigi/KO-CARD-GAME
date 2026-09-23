import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  cardsTable,
  db,
  packDefinitionsTable,
  userCardCollectionsTable,
  userPackInventoryTable,
  usersTable,
} from "@workspace/db";
import { isDailyQuestClaimable, objectiveIncrement, selectDailyQuestDefinitions, validateDailyQuestInput } from "./daily-quest-service";
import { nextAttendanceDayIndex, validateAttendanceInput } from "./attendance-service";
import { grantReward, isFinishedMatchRewardEligible, isRewardType, rewardIdempotencyKey } from "./reward-service";

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

test("CR1/CR2/PR1/PR2/PR3: card and pack grants are authoritative, atomic, and idempotent", async () => {
  assert.equal(isRewardType("CARD"), true);
  assert.equal(isRewardType("PACK"), true);
  assert.equal(isRewardType("GOLD"), false);
  assert.equal(validateDailyQuestInput({
    title: "Card reward",
    description: "",
    objectiveType: "PLAY_MATCH",
    targetValue: 1,
    rewardType: "CARD",
    rewardTargetId: "card-fixture",
    rewardAmount: 2,
  })?.rewardTargetId, "card-fixture");
  assert.equal(validateAttendanceInput({
    dayIndex: 1,
    rewardType: "PACK",
    rewardTargetId: "pack-fixture",
    rewardAmount: 1,
  })?.rewardTargetId, "pack-fixture");

  const fixture = {
    userId: `reward-test-user-${randomUUID()}`,
    cardId: `reward-test-card-${randomUUID()}`,
    packId: `reward-test-pack-${randomUUID()}`,
  };
  await assert.rejects(db.transaction(async (tx) => {
      await tx.insert(usersTable).values({
        id: fixture.userId,
        email: `${fixture.userId}@localhost.test`,
        nickname: fixture.userId,
        passwordHash: "test-only",
      });
      await tx.insert(cardsTable).values({
        id: fixture.cardId,
        name: "Reward Fixture Card",
        cardType: "WRESTLER",
        cost: 1,
        attack: 1,
        health: 1,
        text: "",
        status: "PUBLISHED",
        isToken: false,
        isChampionToken: false,
      });
      await tx.insert(packDefinitionsTable).values({
        id: fixture.packId,
        name: "Reward Fixture Pack",
        status: "PUBLISHED",
      });

      const firstCardGrant = await grantReward({
        userId: fixture.userId,
        sourceType: "DAILY_QUEST_CLAIM",
        sourceId: "daily-fixture",
        rewardType: "CARD",
        rewardTargetId: fixture.cardId,
        amount: 2,
      }, tx);
      await assert.rejects(grantReward({
        userId: fixture.userId,
        sourceType: "DAILY_QUEST_CLAIM",
        sourceId: "daily-fixture",
        rewardType: "CARD",
        rewardTargetId: "wrong-card-from-client",
        amount: 999,
      }, tx), /보상 대상이 유효하지 않습니다/);
      const duplicateCardGrant = await grantReward({
        userId: fixture.userId,
        sourceType: "DAILY_QUEST_CLAIM",
        sourceId: "daily-fixture",
        rewardType: "CARD",
        rewardTargetId: fixture.cardId,
        amount: 999,
      }, tx);
      const firstPackGrant = await grantReward({
        userId: fixture.userId,
        sourceType: "ATTENDANCE_CLAIM",
        sourceId: "attendance-fixture",
        rewardType: "PACK",
        rewardTargetId: fixture.packId,
        amount: 1,
      }, tx);

      assert.equal(firstCardGrant.granted, true);
      assert.equal(duplicateCardGrant.granted, false);
      assert.equal(firstPackGrant.granted, true);
      const [cardOwnership] = await tx.select().from(userCardCollectionsTable)
        .where(eq(userCardCollectionsTable.userId, fixture.userId));
      const [packOwnership] = await tx.select().from(userPackInventoryTable)
        .where(eq(userPackInventoryTable.userId, fixture.userId));
      assert.equal(cardOwnership?.quantity, 2);
      assert.equal(packOwnership?.quantity, 1);
      throw new Error("ROLLBACK_REWARD_FIXTURE");
    }), /ROLLBACK_REWARD_FIXTURE/);
});