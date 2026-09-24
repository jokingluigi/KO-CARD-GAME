import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeClaimForRequest,
  encodeBulkClaim,
  MAX_BULK_PACK_QUANTITY,
  parseBulkPackQuantity,
  rollPackOpenings,
} from "./pack-opening-service";

test("bulk pack quantities enforce integer bounds", () => {
  assert.equal(parseBulkPackQuantity(1), 1);
  assert.equal(parseBulkPackQuantity(MAX_BULK_PACK_QUANTITY), MAX_BULK_PACK_QUANTITY);
  for (const invalid of [0, -1, 1.5, "2", 101, null, undefined]) {
    assert.equal(parseBulkPackQuantity(invalid), null);
  }
});

test("bulk opening rolls N independent openings through the same roller and preserves each result", async () => {
  let rollCount = 0;
  const openings = await rollPackOpenings(3, async () => [{ roll: ++rollCount }]);
  assert.equal(rollCount, 3);
  assert.deepEqual(openings, [
    { rewards: [{ roll: 1 }] },
    { rewards: [{ roll: 2 }] },
    { rewards: [{ roll: 3 }] },
  ]);
});

test("persisted idempotency claims replay exact mode and quantity, rejecting mismatches", () => {
  const openings = [
    { rewards: [{
      rewardType: "NORMAL_CARD",
      cardDefinitionId: "fixture-card",
      card: { id: "fixture-card" },
    }] },
    { rewards: [{
      rewardType: "CHAMPION_UNLOCK",
      championDefinitionId: "fixture-champion",
      champion: { id: "fixture-champion" },
      alreadyOwned: true,
    }] },
  ];
  const encoded = encodeBulkClaim(openings, 2);
  assert.deepEqual(decodeClaimForRequest(encoded, "bulk", 2), {
    kind: "bulk",
    quantity: 2,
    openings,
  });
  assert.deepEqual(decodeClaimForRequest(encoded, "bulk", 3), { kind: "conflict" });
  assert.deepEqual(decodeClaimForRequest(encoded, "single", 1), { kind: "conflict" });
  assert.deepEqual(decodeClaimForRequest([
    { rewardType: "NORMAL_CARD", cardDefinitionId: "fixture-card" },
  ], "bulk", 1), { kind: "conflict" });
});

test("malformed persisted bulk markers never replay as complete openings", () => {
  const validOpening = {
    rewards: [{
      rewardType: "NORMAL_CARD",
      cardDefinitionId: "fixture-card",
      card: { id: "fixture-card" },
    }],
  };
  const stored = (quantity: unknown, openings: unknown, mode: unknown = "bulk") => [{
    __packBulkOpening: { mode, quantity, openings },
  }];
  const malformedClaims = [
    stored(0, [validOpening]),
    stored(MAX_BULK_PACK_QUANTITY + 1, Array.from({ length: MAX_BULK_PACK_QUANTITY + 1 }, () => validOpening)),
    stored(2, [validOpening]),
    stored(1, null),
    stored(1, [null]),
    stored(1, [{ rewards: "not-an-array" }]),
    stored(1, [{ rewards: [null] }]),
    stored(1, [{ rewards: ["not-a-record"] }]),
    stored(1, [{ rewards: [{ rewardType: "UNKNOWN" }] }]),
    stored(1, [{ rewards: [{ rewardType: "NORMAL_CARD", cardDefinitionId: "fixture-card" }] }]),
    stored(1, [validOpening], "single"),
    [{ __packBulkOpening: null }],
  ];

  for (const claim of malformedClaims) {
    assert.deepEqual(decodeClaimForRequest(claim, "bulk", 1), { kind: "conflict" });
    assert.deepEqual(decodeClaimForRequest(claim, "single", 1), { kind: "conflict" });
  }
});

test("legacy single-open claims replay unchanged and conflict with bulk requests", () => {
  const rewards = [{ rewardType: "NORMAL_CARD", cardDefinitionId: "fixture-card" }];
  assert.deepEqual(decodeClaimForRequest(rewards, "single", 1), { kind: "single", rewards });
  assert.deepEqual(decodeClaimForRequest(rewards, "bulk", 1), { kind: "conflict" });
});