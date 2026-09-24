import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  cardsTable,
  db,
  packDefinitionsTable,
  packOpeningClaimsTable,
  userCardCollectionsTable,
  userPackInventoryTable,
  usersTable,
} from "@workspace/db";
import type { Request, Response } from "express";
import { openPackRequest } from "./packs";

test("bulk pack opening is atomic and idempotent for isolated fixture inventory", {
  skip: process.env.NODE_ENV === "production",
}, async () => {
  const suffix = randomUUID();
  const fixture = {
    userId: `pack-bulk-test-user-${suffix}`,
    cardId: `pack-bulk-test-card-${suffix}`,
    packId: `pack-bulk-test-pack-${suffix}`,
  };

  await db.insert(usersTable).values({
    id: fixture.userId,
    email: `${fixture.userId}@localhost.test`,
    nickname: fixture.userId,
    passwordHash: "test-only",
  });

  try {
    await db.insert(cardsTable).values({
      id: fixture.cardId,
      name: "Bulk Pack Fixture Card",
      cardType: "WRESTLER",
      cost: 1,
      attack: 1,
      health: 1,
      text: "",
      rarity: "NORMAL",
      status: "PUBLISHED",
      isToken: false,
      isChampionToken: false,
    });
    await db.insert(packDefinitionsTable).values({
      id: fixture.packId,
      name: "Bulk Pack Fixture",
      status: "PUBLISHED",
      cardsPerPack: 1,
      normalRate: 100,
      legendaryRate: 0,
      championRate: 0,
      normalCardPool: [fixture.cardId],
    });
    await db.insert(userPackInventoryTable).values({
      userId: fixture.userId,
      packDefinitionId: fixture.packId,
      quantity: 2,
    });

    const authUser = {
      id: fixture.userId,
      email: `${fixture.userId}@localhost.test`,
      nickname: fixture.userId,
      role: "USER" as const,
      currency: 0,
      currencyBalance: 0,
      prismBalance: 0,
      championPrismBalance: 0,
      isTestAccount: false,
    };
    const send = async (mode: "single" | "bulk", quantity: number, key: string) => {
      const responseState: { statusCode: number; body?: unknown } = { statusCode: 200 };
      const request = {
        params: { id: fixture.packId },
        authUser,
        get: (name: string) => name === "Idempotency-Key" ? key : undefined,
      };
      const response = {
        status(code: number) {
          responseState.statusCode = code;
          return this;
        },
        json(body: unknown) {
          // Express serializes Date values before they reach clients; compare
          // the initial response and persisted replay at that same wire boundary.
          responseState.body = JSON.parse(JSON.stringify(body)) as unknown;
          return this;
        },
      };
      await openPackRequest(
        request as unknown as Request,
        response as unknown as Response,
        mode,
        quantity,
      );
      return responseState;
    };

    const first = await send("bulk", 2, "fixture-bulk-key");
    assert.equal(first.statusCode, 200);
    const firstResult = first.body as {
      quantity: number;
      openings: Array<{ rewards: Array<{ rewardType: string; cardDefinitionId: string }> }>;
    };
    assert.equal(firstResult.quantity, 2);
    assert.equal(firstResult.openings.length, 2);
    assert.deepEqual(firstResult.openings.map(({ rewards }) => rewards.map(({ rewardType, cardDefinitionId }) => ({
      rewardType,
      cardDefinitionId,
    }))), [
      [{ rewardType: "NORMAL_CARD", cardDefinitionId: fixture.cardId }],
      [{ rewardType: "NORMAL_CARD", cardDefinitionId: fixture.cardId }],
    ]);
    assert.equal((await db.select().from(userPackInventoryTable)
      .where(eq(userPackInventoryTable.userId, fixture.userId)))[0]?.quantity, 0);
    assert.equal((await db.select().from(userCardCollectionsTable)
      .where(eq(userCardCollectionsTable.userId, fixture.userId)))[0]?.quantity, 2);

    const replay = await send("bulk", 2, "fixture-bulk-key");
    assert.equal(replay.statusCode, 200);
    assert.deepEqual(replay.body, first.body);
    assert.equal((await send("bulk", 1, "fixture-bulk-key")).statusCode, 409);
    assert.equal((await send("single", 1, "fixture-bulk-key")).statusCode, 409);

    await db.update(userPackInventoryTable).set({ quantity: 1 })
      .where(eq(userPackInventoryTable.userId, fixture.userId));
    const insufficient = await send("bulk", 2, "fixture-insufficient-key");
    assert.equal(insufficient.statusCode, 422);
    assert.equal((await db.select().from(userPackInventoryTable)
      .where(eq(userPackInventoryTable.userId, fixture.userId)))[0]?.quantity, 1);
    assert.equal((await db.select().from(userCardCollectionsTable)
      .where(eq(userCardCollectionsTable.userId, fixture.userId)))[0]?.quantity, 2);
    assert.equal((await db.select().from(packOpeningClaimsTable)
      .where(eq(packOpeningClaimsTable.userId, fixture.userId))).length, 1);

    await db.update(userPackInventoryTable).set({ quantity: 2 })
      .where(eq(userPackInventoryTable.userId, fixture.userId));
    const concurrent = await Promise.all([
      send("bulk", 2, "fixture-concurrent-key"),
      send("bulk", 2, "fixture-concurrent-key"),
    ]);
    assert.equal(concurrent[0]?.statusCode, 200);
    assert.equal(concurrent[1]?.statusCode, 200);
    assert.deepEqual(concurrent[0]?.body, concurrent[1]?.body);
    assert.equal((await db.select().from(userPackInventoryTable)
      .where(eq(userPackInventoryTable.userId, fixture.userId)))[0]?.quantity, 0);
    assert.equal((await db.select().from(userCardCollectionsTable)
      .where(eq(userCardCollectionsTable.userId, fixture.userId)))[0]?.quantity, 4);
    assert.equal((await db.select().from(packOpeningClaimsTable)
      .where(eq(packOpeningClaimsTable.userId, fixture.userId))).length, 2);
  } finally {
    await db.delete(usersTable).where(eq(usersTable.id, fixture.userId));
    await db.delete(packDefinitionsTable).where(eq(packDefinitionsTable.id, fixture.packId));
    await db.delete(cardsTable).where(eq(cardsTable.id, fixture.cardId));
  }
});