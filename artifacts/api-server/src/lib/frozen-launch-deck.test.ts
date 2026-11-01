import test from "node:test";
import assert from "node:assert/strict";
import { withFrozenLaunchDeck } from "./frozen-launch-deck";
test("queue composition survives later saved edits while preserving the owned record identity", () => {
  const owned = {
      id: "deck",
      userId: "owner",
      name: "edited",
      championDefinitionId: "new",
      cardDefinitionIds: ["new"],
    },
    snapshot = {
      deckId: "deck",
      deckName: "queued",
      championDefinitionId: "old",
      cardDefinitionIds: ["old"],
    };
  const result = withFrozenLaunchDeck(owned, snapshot);
  assert.equal(result.userId, "owner");
  assert.equal(result.championDefinitionId, "old");
  assert.deepEqual(result.cardDefinitionIds, ["old"]);
  assert.equal(result.name, "queued");
  result.cardDefinitionIds.push("x");
  assert.deepEqual(snapshot.cardDefinitionIds, ["old"]);
  assert.deepEqual(owned.cardDefinitionIds, ["new"]);
  assert.equal(withFrozenLaunchDeck(owned), owned);
  assert.throws(() =>
    withFrozenLaunchDeck({ ...owned, id: "other" }, snapshot),
  );
});
