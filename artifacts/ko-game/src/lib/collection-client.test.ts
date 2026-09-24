import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregatePackRewards,
  clearBulkOpenIntention,
  CollectionRequestError,
  getBulkOpenIntention,
  getBulkOpenQuantities,
  isDefinitivePackOpenRejection,
  isValidBulkOpenQuantity,
  MAX_BULK_PACK_OPEN_QUANTITY,
  readBulkOpenIntention,
  saveBulkOpenIntention,
  type PackReward,
} from "./collection-client";

test("bulk quantity presets never exceed pack inventory", () => {
  assert.deepEqual(getBulkOpenQuantities(0), []);
  assert.deepEqual(getBulkOpenQuantities(1), [1]);
  assert.deepEqual(getBulkOpenQuantities(1.5), []);
  assert.deepEqual(getBulkOpenQuantities(7), [1, 5]);
  assert.deepEqual(getBulkOpenQuantities(10), [1, 5, 10]);
  assert.deepEqual(getBulkOpenQuantities(101), [1, 5, 10]);
});

test("bulk opening enforces the server's safe integer quantity range", () => {
  assert.equal(isValidBulkOpenQuantity(1), true);
  assert.equal(isValidBulkOpenQuantity(MAX_BULK_PACK_OPEN_QUANTITY), true);
  assert.equal(isValidBulkOpenQuantity(0), false);
  assert.equal(isValidBulkOpenQuantity(1.5), false);
  assert.equal(isValidBulkOpenQuantity(MAX_BULK_PACK_OPEN_QUANTITY + 1), false);
});

test("an unresolved open blocks a different quantity or pack until reconciled", () => {
  let sequence = 0;
  const createKey = () => `request-${++sequence}`;
  const first = getBulkOpenIntention(null, "pack-a", 5, createKey);
  const retry = getBulkOpenIntention(first, "pack-a", 5, createKey);

  assert.equal(retry.key, first.key);
  assert.throws(() => getBulkOpenIntention(retry, "pack-a", 10, createKey), /이전 팩 개봉 결과/);
  assert.throws(() => getBulkOpenIntention(retry, "pack-b", 5, createKey), /이전 팩 개봉 결과/);
  assert.equal(sequence, 1);
  const nextIntent = getBulkOpenIntention(null, "pack-a", 10, createKey);
  assert.notEqual(nextIntent.key, first.key);
});

test("a committed response lost to the network stays locked to the original request", () => {
  let sequence = 0;
  const committedButResponseLost = getBulkOpenIntention(null, "pack-a", 5, () => `request-${++sequence}`);
  // Retrying the same key is safe; trying a new amount cannot create a second request.
  assert.equal(getBulkOpenIntention(committedButResponseLost, "pack-a", 5, () => `request-${++sequence}`).key, committedButResponseLost.key);
  assert.throws(() => getBulkOpenIntention(committedButResponseLost, "pack-a", 10, () => `request-${++sequence}`));
  assert.equal(sequence, 1);
});

test("unresolved intentions survive reload in user-scoped session storage", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const intention = { packId: "pack-a", quantity: 5, key: "request-stable" };
  assert.equal(saveBulkOpenIntention(storage, "user-a", intention), true);

  // A page reload reconstructs state from sessionStorage and replays this exact key.
  const reloadedIntention = readBulkOpenIntention(storage, "user-a");
  assert.deepEqual(reloadedIntention, intention);
  assert.equal(readBulkOpenIntention(storage, "user-b"), null);
  assert.equal(getBulkOpenIntention(reloadedIntention, "pack-a", 5, () => "new-key").key, "request-stable");
  assert.equal(clearBulkOpenIntention(storage, "user-a"), true);
  assert.equal(readBulkOpenIntention(storage, "user-a"), null);
});

test("only definitive no-commit responses clear an opening intention", () => {
  assert.equal(isDefinitivePackOpenRejection(new CollectionRequestError("rejected", 422)), true);
  assert.equal(isDefinitivePackOpenRejection(new CollectionRequestError("conflict", 409)), false);
  assert.equal(isDefinitivePackOpenRejection(new Error("network down")), false);
});

test("bulk results aggregate duplicate card rewards without merging different reward types", () => {
  const rewards: PackReward[] = [
    { rewardType: "NORMAL_CARD", cardDefinitionId: "card-1" },
    { rewardType: "NORMAL_CARD", cardDefinitionId: "card-1" },
    { rewardType: "LEGENDARY_CARD", cardDefinitionId: "card-1" },
    { rewardType: "SKIN", cardDefinitionId: "card-1", skinDefinitionId: "skin-a" },
    { rewardType: "SKIN", cardDefinitionId: "card-1", skinDefinitionId: "skin-b" },
  ];

  assert.deepEqual(aggregatePackRewards(rewards).map(({ key, quantity }) => ({ key, quantity })), [
    { key: "NORMAL_CARD:card-1", quantity: 2 },
    { key: "LEGENDARY_CARD:card-1", quantity: 1 },
    { key: "SKIN:skin-a", quantity: 1 },
    { key: "SKIN:skin-b", quantity: 1 },
  ]);
});