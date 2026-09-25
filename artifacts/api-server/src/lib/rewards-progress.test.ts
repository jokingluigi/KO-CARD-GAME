import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  cardsTable,
  db,
  packDefinitionsTable,
  rewardGrantsTable,
  userCardCollectionsTable,
  userPackInventoryTable,
  usersTable,
} from "@workspace/db";
import { isDailyQuestClaimable, objectiveIncrement, selectDailyQuestDefinitions, validateDailyQuestInput } from "./daily-quest-service";
import { questConditionMatches, questEventIncrement, validateQuestCondition, QUEST_CONDITION_SCHEMA_VERSION } from "@workspace/game-engine";
import { nextAttendanceDayIndex, validateAttendanceInput } from "./attendance-service";
import { grantReward, isFinishedMatchRewardEligible, isRewardType, rewardIdempotencyKey } from "./reward-service";
import { grantAccountStarterPacks, StarterPackConfigurationError } from "./starter-pack-rewards";
import { ensureStarterCollection } from "./collection";

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

test("QV2: validates canonical COUNT/SUM conditions and evaluates AND/OR", () => {
  const condition = {
    schemaVersion: QUEST_CONDITION_SCHEMA_VERSION,
    condition: {
      allOf: [
        { event: "CARD_PLAYED", filters: { cardType: "WRESTLER" } },
        { anyOf: [
          { event: "CARD_PLAYED", filters: { tagsAny: ["zombie"] } },
          { event: "CARD_PLAYED", filters: { sourceActionType: "PLAY_FROM_HAND" } },
        ] },
      ],
    },
    progress: { mode: "COUNT" },
    required: 3,
  } as const;
  const parsed = validateQuestCondition(condition);
  assert.ok(parsed);
  const event = {
    type: "CARD_PLAYED" as const,
    playerId: "PLAYER_ONE",
    cardType: "WRESTLER" as const,
    tags: ["zombie"],
    sourceContext: { sourcePlayerId: "PLAYER_ONE", sourceActionType: "PLAY_FROM_HAND" },
  };
  assert.equal(questConditionMatches(parsed.condition, event, "PLAYER_ONE", { cardMetadataAvailable: true, cardTags: ["zombie"] }), true);
  assert.equal(questEventIncrement(parsed, event, "PLAYER_ONE", { cardMetadataAvailable: true, cardTags: ["zombie"] }), 1);
  const sum = validateQuestCondition({
    schemaVersion: QUEST_CONDITION_SCHEMA_VERSION,
    condition: { event: "DAMAGE_DEALT" },
    progress: { mode: "SUM", field: "amount" },
    required: 50,
  });
  assert.ok(sum);
  assert.equal(questEventIncrement(sum, { type: "DAMAGE_DEALT", playerId: "PLAYER_ONE", amount: 12 }, "PLAYER_ONE"), 12);
});

test("QV2: rejects unknown fields and SUM of nonnumeric event fields", () => {
  assert.equal(validateQuestCondition({
    schemaVersion: QUEST_CONDITION_SCHEMA_VERSION,
    condition: { event: "CARD_PLAYED", filters: { unknownField: "x" } },
    progress: { mode: "COUNT" },
    required: 1,
  }), null);
  assert.equal(validateQuestCondition({
    schemaVersion: QUEST_CONDITION_SCHEMA_VERSION,
    condition: { event: "CARD_PLAYED" },
    progress: { mode: "SUM", field: "cardType" },
    required: 1,
  }), null);
  assert.equal(validateQuestCondition({
    schemaVersion: QUEST_CONDITION_SCHEMA_VERSION,
    condition: { allOf: [{ event: "DAMAGE_DEALT" }, { event: "CARD_PLAYED" }] },
    progress: { mode: "SUM", field: "amount" },
    required: 1,
  }), null);
  assert.equal(questConditionMatches(
    { event: "CARD_PLAYED", filters: { sourcePlayer: "ENEMY" } },
    { type: "CARD_PLAYED", playerId: "PLAYER_ONE" },
    "PLAYER_ONE",
  ), false);
  const mismatch = validateDailyQuestInput({
    title: "Mismatch",
    description: "",
    objectiveType: "CARD_PLAYED",
    targetValue: 2,
    condition: {
      schemaVersion: QUEST_CONDITION_SCHEMA_VERSION,
      condition: { event: "CARD_PLAYED" },
      progress: { mode: "COUNT" },
      required: 3,
    },
    rewardType: "CURRENCY",
    rewardAmount: 1,
  });
  assert.equal(mismatch, null);
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

test("SR1/SR2/SR3/S5/S8/S9/S10: signup grants every configured pack once and rolls back atomically", async () => {
  const fixture = {
    userId: `starter-pack-test-user-${randomUUID()}`,
    extraPackId: `starter-pack-test-pack-${randomUUID()}`,
  };

  await assert.rejects(db.transaction(async (tx) => {
    await tx.insert(usersTable).values({
      id: fixture.userId,
      email: `${fixture.userId}@localhost.test`,
      nickname: fixture.userId,
      passwordHash: "test-only",
    });
    await tx.insert(packDefinitionsTable).values({
      id: fixture.extraPackId,
      name: "Starter Reward Fixture Pack",
      status: "PUBLISHED",
      starterRewardQuantity: 3,
    });

    const configuredPacks = await tx.select({
      id: packDefinitionsTable.id,
      quantity: packDefinitionsTable.starterRewardQuantity,
    }).from(packDefinitionsTable)
      .where(sql`${packDefinitionsTable.starterRewardQuantity} <> 0`);
    assert.ok(configuredPacks.length >= 2, "expected the configured base pack and the fixture pack");

    const firstAttempt = await grantAccountStarterPacks(fixture.userId, tx);
    const retryAttempt = await grantAccountStarterPacks(fixture.userId, tx);
    assert.equal(firstAttempt.length, configuredPacks.length);
    assert.ok(firstAttempt.every((grant) => grant.granted));
    assert.ok(retryAttempt.every((grant) => !grant.granted));

    const inventory = await tx.select({
      packDefinitionId: userPackInventoryTable.packDefinitionId,
      quantity: userPackInventoryTable.quantity,
    }).from(userPackInventoryTable)
      .where(eq(userPackInventoryTable.userId, fixture.userId));
    assert.deepEqual(
      new Map(inventory.map((item) => [item.packDefinitionId, item.quantity])),
      new Map(configuredPacks.map((pack) => [pack.id, pack.quantity])),
    );
    const grants = await tx.select().from(rewardGrantsTable)
      .where(eq(rewardGrantsTable.userId, fixture.userId));
    assert.equal(grants.length, configuredPacks.length);
    throw new Error("ROLLBACK_STARTER_PACK_FIXTURE");
  }), /ROLLBACK_STARTER_PACK_FIXTURE/);

  assert.equal((await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.id, fixture.userId))).length, 0);
  assert.equal((await db.select({ id: rewardGrantsTable.id }).from(rewardGrantsTable)
    .where(eq(rewardGrantsTable.userId, fixture.userId))).length, 0);
  assert.equal((await db.select({ userId: userPackInventoryTable.userId }).from(userPackInventoryTable)
    .where(eq(userPackInventoryTable.userId, fixture.userId))).length, 0);
  assert.equal((await db.select({ id: packDefinitionsTable.id }).from(packDefinitionsTable)
    .where(eq(packDefinitionsTable.id, fixture.extraPackId))).length, 0);
});

test("SR4: concurrent starter initialization only increments each pack once", async () => {
  const fixtureUserId = `starter-pack-concurrent-user-${randomUUID()}`;
  const configuredPacks = await db.select({
    id: packDefinitionsTable.id,
    quantity: packDefinitionsTable.starterRewardQuantity,
  }).from(packDefinitionsTable)
    .where(sql`${packDefinitionsTable.starterRewardQuantity} > 0`);
  assert.ok(configuredPacks.length > 0);

  await db.insert(usersTable).values({
    id: fixtureUserId,
    email: `${fixtureUserId}@localhost.test`,
    nickname: fixtureUserId,
    passwordHash: "test-only",
  });
  try {
    const attempts = await Promise.all([
      db.transaction((tx) => grantAccountStarterPacks(fixtureUserId, tx)),
      db.transaction((tx) => grantAccountStarterPacks(fixtureUserId, tx)),
    ]);
    assert.equal(attempts.flat().filter((grant) => grant.granted).length, configuredPacks.length);

    const inventory = await db.select({
      packDefinitionId: userPackInventoryTable.packDefinitionId,
      quantity: userPackInventoryTable.quantity,
    }).from(userPackInventoryTable)
      .where(eq(userPackInventoryTable.userId, fixtureUserId));
    assert.deepEqual(
      new Map(inventory.map((item) => [item.packDefinitionId, item.quantity])),
      new Map(configuredPacks.map((pack) => [pack.id, pack.quantity])),
    );
  } finally {
    await db.delete(usersTable).where(eq(usersTable.id, fixtureUserId));
  }
});

test("SR6: existing-account bootstrap does not issue signup pack rewards", async () => {
  const fixtureUserId = `starter-pack-existing-user-${randomUUID()}`;
  await db.insert(usersTable).values({
    id: fixtureUserId,
    email: `${fixtureUserId}@localhost.test`,
    nickname: fixtureUserId,
    passwordHash: "test-only",
  });
  try {
    await ensureStarterCollection(fixtureUserId);
    assert.equal((await db.select({ id: rewardGrantsTable.id }).from(rewardGrantsTable)
      .where(eq(rewardGrantsTable.userId, fixtureUserId))).length, 0);
    assert.equal((await db.select({ userId: userPackInventoryTable.userId }).from(userPackInventoryTable)
      .where(eq(userPackInventoryTable.userId, fixtureUserId))).length, 0);
  } finally {
    await db.delete(usersTable).where(eq(usersTable.id, fixtureUserId));
  }
});

test("SR7a: invalid starter-pack configuration rejects signup without partial grants", async () => {
  const fixture = {
    userId: `starter-pack-invalid-user-${randomUUID()}`,
    packId: `starter-pack-invalid-pack-${randomUUID()}`,
  };

  await assert.rejects(db.transaction(async (tx) => {
    await tx.insert(usersTable).values({
      id: fixture.userId,
      email: `${fixture.userId}@localhost.test`,
      nickname: fixture.userId,
      passwordHash: "test-only",
    });
    await tx.insert(packDefinitionsTable).values({
      id: fixture.packId,
      name: "Invalid Starter Reward Fixture Pack",
      status: "DISABLED",
      starterRewardQuantity: 2,
    });
    await assert.rejects(
      grantAccountStarterPacks(fixture.userId, tx),
      StarterPackConfigurationError,
    );
    throw new Error("ROLLBACK_INVALID_STARTER_PACK_FIXTURE");
  }), /ROLLBACK_INVALID_STARTER_PACK_FIXTURE/);

  assert.equal((await db.select({ id: rewardGrantsTable.id }).from(rewardGrantsTable)
    .where(eq(rewardGrantsTable.userId, fixture.userId))).length, 0);
  assert.equal((await db.select({ userId: userPackInventoryTable.userId }).from(userPackInventoryTable)
    .where(eq(userPackInventoryTable.userId, fixture.userId))).length, 0);
  assert.equal((await db.select({ id: packDefinitionsTable.id }).from(packDefinitionsTable)
    .where(eq(packDefinitionsTable.id, fixture.packId))).length, 0);
});

test("SR7b: signup fails closed when no starter pack is configured", async () => {
  const fixtureUserId = `starter-pack-unconfigured-user-${randomUUID()}`;

  await assert.rejects(db.transaction(async (tx) => {
    await tx.insert(usersTable).values({
      id: fixtureUserId,
      email: `${fixtureUserId}@localhost.test`,
      nickname: fixtureUserId,
      passwordHash: "test-only",
    });
    await tx.update(packDefinitionsTable)
      .set({ starterRewardQuantity: 0 })
      .where(sql`${packDefinitionsTable.starterRewardQuantity} <> 0`);
    await assert.rejects(
      grantAccountStarterPacks(fixtureUserId, tx),
      StarterPackConfigurationError,
    );
    throw new Error("ROLLBACK_UNCONFIGURED_STARTER_PACK_FIXTURE");
  }), /ROLLBACK_UNCONFIGURED_STARTER_PACK_FIXTURE/);

  assert.equal((await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.id, fixtureUserId))).length, 0);
});
